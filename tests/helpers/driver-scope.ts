import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import ts from 'typescript'

/*
 * A static check that every SQL statement in the app keeps a driver to their
 * own rows. Used by tests/db/driver-scope.test.ts, which holds the table list
 * and the allow-list and explains the rule. This file only does the work:
 *
 * 1. Finding statements: every tagged template whose tag is a known SQL tag
 *    (`sql`, `sql()`, `db`) in the TypeScript source, found with the compiler
 *    API. Each becomes one statement, with `$1`, `$2`, ... for its `${...}`
 *    holes, the source text of each hole, the file, line and the enclosing
 *    function. Anything else that looks like SQL (another tag, a plain
 *    string, `sql.query()`/`sql.unsafe()`, a SQL fragment inside a hole) is
 *    reported as a problem, so no statement can hide from the check.
 * 2. Reading a statement: a small tokenizer (comments, string literals,
 *    dollar quotes, quoted identifiers, `$n` parameters) and a parser for the
 *    subset of PostgreSQL the app writes: WITH (CTEs), SELECT, INSERT,
 *    UPDATE, DELETE, UNION/INTERSECT/EXCEPT, FROM/JOIN with aliases,
 *    subqueries in parentheses, ON CONFLICT and RETURNING. It is not a full
 *    SQL parser; a statement it can't follow fails the check rather than
 *    passing it.
 * 3. The rule, for every reference to a driver-owned table, as explained in
 *    the test file.
 */

/* ---- Configuration types (the values live in the test) ---- */

export type TableRule =
	/** Rows belong to one driver: `owner` is the column holding the driver. */
	| {
			kind: 'driver'
			owner: string
			/** The column that identifies one row. */
			key: string
			/** Columns that point at another table's key (foreign keys). */
			refs?: Record<string, string>
	  }
	/** Shared or system table: queries on it aren't checked. */
	| { kind: 'not-driver'; why: string }
	/** No longer used: any query on it fails. */
	| { kind: 'retired'; why: string }

/** Table name (lower case, as Postgres folds it) -> rule. */
export type Tables = Record<string, TableRule>

export type AllowEntry = {
	/** Path from the repository root, e.g. src/lib/db/rate-limits.ts. */
	file: string
	/** Enclosing function; `name#case` for one `case` of a switch. Matches `name#...` too. */
	fn: string
	why: string
}

/** Identifiers that name (or look like) one of the app's tables. */
export const APP_TABLE_PATTERN = /^(pttrips|pt_[a-z0-9_]+)$/

/** The names the app gives the neon `sql` function (tag `sql()` is `sql` called with no arguments). */
export const SQL_TAGS = ['sql', 'sql()', 'db']

/* ---- Finding statements in TypeScript ---- */

export type SqlStatement = {
	file: string
	line: number
	/** Enclosing function, with `#case` inside a switch case. */
	fn: string
	/** The SQL with `$1`, `$2`, ... in place of each `${...}` hole. */
	text: string
	/** Source text of each hole's expression; holes[0] is `$1`. */
	holes: string[]
	/** Maps an offset in `text` to a line in `file`. */
	lineAt: (offset: number) => number
}

export type Finding = {
	file: string
	line: number
	fn: string
	message: string
}

/** Text that reads like SQL naming one of the app's tables. */
const SQL_LIKE = /\b(from|into|update|join|table)\s+(pttrips|pt_[a-z0-9_]+)\b/i

function enclosingName(node: ts.Node): string {
	let caseLabel: string | undefined
	for (let n: ts.Node | undefined = node.parent; n; n = n.parent) {
		if (
			caseLabel === undefined &&
			ts.isCaseClause(n) &&
			(ts.isStringLiteral(n.expression) ||
				ts.isNoSubstitutionTemplateLiteral(n.expression))
		) {
			caseLabel = n.expression.text
		}
		let name: string | undefined
		if (
			(ts.isFunctionDeclaration(n) ||
				ts.isMethodDeclaration(n) ||
				ts.isFunctionExpression(n)) &&
			n.name
		) {
			name = n.name.getText()
		} else if (
			(ts.isArrowFunction(n) || ts.isFunctionExpression(n)) &&
			ts.isVariableDeclaration(n.parent)
		) {
			name = n.parent.name.getText()
		} else if (
			(ts.isArrowFunction(n) || ts.isFunctionExpression(n)) &&
			ts.isPropertyAssignment(n.parent)
		) {
			name = n.parent.name.getText()
		}
		if (name) return caseLabel === undefined ? name : `${name}#${caseLabel}`
	}
	return caseLabel === undefined ? '(top level)' : `(top level)#${caseLabel}`
}

function containsSqlTag(node: ts.Node): boolean {
	let found = false
	const visit = (n: ts.Node) => {
		if (found) return
		if (
			ts.isTaggedTemplateExpression(n) &&
			SQL_TAGS.includes(n.tag.getText())
		) {
			found = true
			return
		}
		ts.forEachChild(n, visit)
	}
	visit(node)
	return found
}

/** Every SQL statement in one TypeScript source, and anything SQL-like that isn't one. */
export function findSqlStatements(
	file: string,
	source: string,
): { statements: SqlStatement[]; problems: Finding[] } {
	const sf = ts.createSourceFile(
		file,
		source,
		ts.ScriptTarget.Latest,
		true,
		file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
	)
	const statements: SqlStatement[] = []
	const problems: Finding[] = []
	const lineOf = (pos: number) =>
		sf.getLineAndCharacterOfPosition(pos).line + 1
	const problem = (node: ts.Node, message: string) =>
		problems.push({
			file,
			line: lineOf(node.getStart()),
			fn: enclosingName(node),
			message,
		})

	const visit = (node: ts.Node) => {
		if (ts.isTaggedTemplateExpression(node)) {
			const tag = node.tag.getText()
			const tpl = node.template
			if (SQL_TAGS.includes(tag)) {
				// Pieces of raw text, each with its offset in the source file.
				const pieces: { text: string; at: number }[] = []
				const holes: string[] = []
				if (ts.isNoSubstitutionTemplateLiteral(tpl)) {
					pieces.push({
						text: tpl.rawText ?? tpl.text,
						at: tpl.getStart() + 1,
					})
				} else {
					pieces.push({
						text: tpl.head.rawText ?? tpl.head.text,
						at: tpl.head.getStart() + 1,
					})
					for (const span of tpl.templateSpans) {
						holes.push(span.expression.getText())
						if (containsSqlTag(span.expression)) {
							problem(
								span.expression,
								'a SQL fragment is nested inside a template hole; the checker cannot read composed SQL. Write the statement out in full.',
							)
						}
						pieces.push({
							text: span.literal.rawText ?? span.literal.text,
							at: span.literal.getStart() + 1,
						})
					}
				}
				let text = ''
				const map: { from: number; at: number }[] = []
				pieces.forEach((piece, i) => {
					if (i > 0) text += ` $${i} `
					map.push({ from: text.length, at: piece.at })
					text += piece.text
				})
				const lineAt = (offset: number) => {
					let best = map[0]
					for (const m of map) if (m.from <= offset) best = m
					return lineOf(best.at + Math.max(0, offset - best.from))
				}
				statements.push({
					file,
					line: lineOf(node.getStart()),
					fn: enclosingName(node),
					text,
					holes,
					lineAt,
				})
				// Holes are TypeScript expressions: look inside them too.
				if (!ts.isNoSubstitutionTemplateLiteral(tpl)) {
					for (const span of tpl.templateSpans) visit(span.expression)
				}
				return
			}
			const raw = ts.isNoSubstitutionTemplateLiteral(tpl)
				? tpl.text
				: [
						tpl.head.text,
						...tpl.templateSpans.map((s) => s.literal.text),
					].join(' ')
			if (SQL_LIKE.test(raw)) {
				problem(
					node,
					`the template tagged \`${tag}\` looks like SQL but \`${tag}\` is not a known SQL tag. Use \`sql\` (or add the tag to SQL_TAGS in tests/helpers/driver-scope.ts).`,
				)
			}
		} else if (
			ts.isStringLiteral(node) ||
			ts.isNoSubstitutionTemplateLiteral(node)
		) {
			if (
				SQL_LIKE.test(node.text) &&
				!ts.isImportDeclaration(node.parent)
			) {
				problem(
					node,
					'this string looks like SQL outside a `sql` tagged template, so it cannot be checked. Write queries as sql`...`.',
				)
			}
		} else if (ts.isTemplateExpression(node)) {
			const raw = [
				node.head.text,
				...node.templateSpans.map((s) => s.literal.text),
			].join(' ')
			if (SQL_LIKE.test(raw)) {
				problem(
					node,
					'this template string looks like SQL outside a `sql` tagged template, so it cannot be checked. Write queries as sql`...`.',
				)
			}
		} else if (
			ts.isPropertyAccessExpression(node) &&
			(node.name.text === 'unsafe' ||
				(node.name.text === 'query' &&
					SQL_TAGS.includes(node.expression.getText())))
		) {
			problem(
				node,
				`\`${node.getText()}\` runs SQL the checker cannot read. Use the sql\`...\` tagged template.`,
			)
		}
		ts.forEachChild(node, visit)
	}
	visit(sf)
	return { statements, problems }
}

/* ---- Tokenizer ---- */

type Tok = {
	kind: 'word' | 'param' | 'string' | 'number' | 'op'
	/** Lower case for words (Postgres folds unquoted names). */
	v: string
	pos: number
	/** For params: the 1-based index. */
	n?: number
}
type Group = { kind: 'group'; children: Node[]; pos: number }
type Node = Tok | Group

export class SqlSyntaxError extends Error {}

export function tokenize(sql: string): Tok[] {
	const toks: Tok[] = []
	let i = 0
	const len = sql.length
	while (i < len) {
		const c = sql[i]
		if (/\s/.test(c)) {
			i++
		} else if (c === '-' && sql[i + 1] === '-') {
			while (i < len && sql[i] !== '\n') i++
		} else if (c === '/' && sql[i + 1] === '*') {
			let depth = 1
			i += 2
			while (i < len && depth > 0) {
				if (sql[i] === '/' && sql[i + 1] === '*') {
					depth++
					i += 2
				} else if (sql[i] === '*' && sql[i + 1] === '/') {
					depth--
					i += 2
				} else i++
			}
			if (depth > 0) throw new SqlSyntaxError('unterminated /* comment')
		} else if (
			c === "'" ||
			((c === 'e' || c === 'E') && sql[i + 1] === "'")
		) {
			const start = i
			const escapes = c !== "'"
			i += escapes ? 2 : 1
			for (;;) {
				if (i >= len)
					throw new SqlSyntaxError('unterminated string literal')
				if (escapes && sql[i] === '\\') {
					i += 2
				} else if (sql[i] === "'") {
					if (sql[i + 1] === "'") i += 2
					else {
						i++
						break
					}
				} else i++
			}
			toks.push({ kind: 'string', v: sql.slice(start, i), pos: start })
		} else if (c === '"') {
			const start = i
			const end = sql.indexOf('"', i + 1)
			if (end < 0)
				throw new SqlSyntaxError('unterminated quoted identifier')
			toks.push({
				kind: 'word',
				v: sql.slice(i + 1, end).toLowerCase(),
				pos: start,
			})
			i = end + 1
		} else if (c === '$' && /[0-9]/.test(sql[i + 1] ?? '')) {
			const start = i
			i++
			while (i < len && /[0-9]/.test(sql[i])) i++
			const n = Number(sql.slice(start + 1, i))
			toks.push({ kind: 'param', v: `$${n}`, n, pos: start })
		} else if (c === '$') {
			const m = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(i))
			if (!m) throw new SqlSyntaxError(`unexpected "$" at ${i}`)
			const end = sql.indexOf(m[0], i + m[0].length)
			if (end < 0)
				throw new SqlSyntaxError('unterminated dollar-quoted string')
			toks.push({
				kind: 'string',
				v: sql.slice(i, end + m[0].length),
				pos: i,
			})
			i = end + m[0].length
		} else if (/[A-Za-z_]/.test(c)) {
			const start = i
			while (i < len && /[A-Za-z0-9_$]/.test(sql[i])) i++
			toks.push({
				kind: 'word',
				v: sql.slice(start, i).toLowerCase(),
				pos: start,
			})
		} else if (
			/[0-9]/.test(c) ||
			(c === '.' && /[0-9]/.test(sql[i + 1] ?? ''))
		) {
			const start = i
			while (i < len && /[0-9.eE]/.test(sql[i])) i++
			toks.push({ kind: 'number', v: sql.slice(start, i), pos: start })
		} else if ('(),;.[]'.includes(c)) {
			toks.push({ kind: 'op', v: c, pos: i })
			i++
		} else {
			const start = i
			while (i < len && /[+\-*/<>=~!@#%^&|`?:]/.test(sql[i])) {
				// `--` or `/*` start a comment even right after an operator.
				if (
					(sql[i] === '-' && sql[i + 1] === '-') ||
					(sql[i] === '/' && sql[i + 1] === '*')
				)
					break
				i++
			}
			if (i === start)
				throw new SqlSyntaxError(`unexpected character "${c}"`)
			toks.push({ kind: 'op', v: sql.slice(start, i), pos: start })
		}
	}
	return toks
}

function groupTokens(toks: Tok[]): Node[] {
	const root: Node[] = []
	const stack: Node[][] = [root]
	for (const t of toks) {
		if (t.kind === 'op' && t.v === '(') {
			const g: Group = { kind: 'group', children: [], pos: t.pos }
			stack[stack.length - 1].push(g)
			stack.push(g.children)
		} else if (t.kind === 'op' && t.v === ')') {
			if (stack.length === 1) throw new SqlSyntaxError('unbalanced ")"')
			stack.pop()
		} else stack[stack.length - 1].push(t)
	}
	if (stack.length !== 1) throw new SqlSyntaxError('unbalanced "("')
	return root
}

/* ---- Parser and rule ---- */

const isGroup = (n: Node | undefined): n is Group => n?.kind === 'group'
const isWord = (n: Node | undefined, ...vs: string[]): n is Tok =>
	n !== undefined &&
	n.kind === 'word' &&
	(vs.length === 0 || vs.includes(n.v))
const isOp = (n: Node | undefined, v: string): n is Tok =>
	n !== undefined && n.kind === 'op' && n.v === v

/** Words that end a FROM item: never an alias. */
const NOT_ALIAS = new Set([
	'on',
	'using',
	'join',
	'inner',
	'left',
	'right',
	'full',
	'cross',
	'natural',
	'outer',
	'where',
	'group',
	'having',
	'window',
	'order',
	'limit',
	'offset',
	'fetch',
	'for',
	'union',
	'intersect',
	'except',
	'returning',
	'set',
	'select',
	'values',
	'default',
	'lateral',
	'with',
	'from',
])

type Cte = { name: string; scoped: boolean; base: string | null }
type Scope = Map<string, Cte>[]

type Rel = {
	kind: 'table' | 'cte' | 'other'
	/** Table or CTE name. */
	name: string
	/** What the statement calls it: the alias, else the name. */
	ref: string
	table?: string
	cte?: Cte
	join: 'first' | 'inner' | 'left' | 'right' | 'full'
	on: Node[] | null
	role: 'read' | 'target'
}

type BlockInfo = {
	scoped: boolean
	base: string | null
	/** For SELECT: the select-list items, and its relations. */
	items?: Node[][]
	rels: Rel[]
	scopedRels: Set<Rel>
}

type QueryInfo = { scoped: boolean; base: string | null; branches: BlockInfo[] }

/** Splits on top-level commas. */
function splitCommas(nodes: Node[]): Node[][] {
	const out: Node[][] = [[]]
	for (const n of nodes) {
		if (isOp(n, ',')) out.push([])
		else out[out.length - 1].push(n)
	}
	return out.length === 1 && out[0].length === 0 ? [] : out
}

/** The tokens of a node list, groups flattened. */
function flatten(nodes: Node[], out: Tok[] = []): Tok[] {
	for (const n of nodes) {
		if (isGroup(n)) flatten(n.children, out)
		else out.push(n)
	}
	return out
}

const firstPos = (nodes: Node[]) => nodes[0]?.pos ?? 0

class Analyzer {
	errors: { pos: number; message: string }[] = []
	/** Why each driver-owned reference passed, for tests to read. */
	trace: string[] = []
	consumed = new Set<Tok>()
	constructor(
		private tables: Tables,
		private holes: string[],
	) {}

	error(pos: number, message: string) {
		this.errors.push({ pos, message })
	}

	rule(name: string) {
		return this.tables[name]
	}

	driverRule(name: string | null | undefined) {
		const r = name ? this.tables[name] : undefined
		return r?.kind === 'driver' ? r : undefined
	}

	/** A full query: optional WITH, then one or more branches joined by set operations. */
	query(nodes: Node[], scope: Scope): QueryInfo {
		let i = 0
		const ctes = new Map<string, Cte>()
		const inner: Scope = [ctes, ...scope]
		if (isWord(nodes[0], 'with')) {
			i++
			if (isWord(nodes[i], 'recursive')) {
				this.error(
					nodes[i].pos,
					'WITH RECURSIVE is not supported by the checker',
				)
				i++
			}
			for (;;) {
				const name = nodes[i]
				if (!isWord(name)) {
					this.error(
						firstPos(nodes.slice(i)),
						'expected a CTE name after WITH',
					)
					return { scoped: false, base: null, branches: [] }
				}
				this.consumed.add(name)
				i++
				if (isGroup(nodes[i])) i++ // column names
				if (!isWord(nodes[i], 'as')) {
					this.error(name.pos, `expected AS after CTE ${name.v}`)
					return { scoped: false, base: null, branches: [] }
				}
				i++
				if (isWord(nodes[i], 'not')) i++
				if (isWord(nodes[i], 'materialized')) i++
				const body = nodes[i]
				if (!isGroup(body)) {
					this.error(name.pos, `expected (...) for CTE ${name.v}`)
					return { scoped: false, base: null, branches: [] }
				}
				i++
				const info = this.query(body.children, inner)
				ctes.set(name.v, {
					name: name.v,
					scoped: info.scoped,
					base: info.base,
				})
				if (isOp(nodes[i], ',')) i++
				else break
			}
		}
		const branches: Node[][] = [[]]
		for (const n of nodes.slice(i)) {
			if (isWord(n, 'union', 'intersect', 'except')) branches.push([])
			else if (
				branches[branches.length - 1].length === 0 &&
				branches.length > 1 &&
				isWord(n, 'all', 'distinct')
			)
				continue
			else branches[branches.length - 1].push(n)
		}
		const infos = branches.map((b) =>
			b.length === 1 && isGroup(b[0])
				? this.mergeQuery(this.query(b[0].children, inner))
				: this.block(b, inner),
		)
		const base = infos[0]?.base ?? null
		return {
			scoped:
				infos.length > 0 &&
				infos.every((b) => b.scoped && b.base === base),
			base,
			branches: infos,
		}
	}

	private mergeQuery(q: QueryInfo): BlockInfo {
		return q.branches.length === 1
			? q.branches[0]
			: {
					scoped: q.scoped,
					base: q.base,
					rels: [],
					scopedRels: new Set(),
				}
	}

	/** Parses every subquery found anywhere in these nodes. */
	scan(nodes: Node[], scope: Scope) {
		for (const n of nodes) {
			if (!isGroup(n)) continue
			if (isWord(n.children[0], 'select', 'with', 'values'))
				this.query(n.children, scope)
			else this.scan(n.children, scope)
		}
	}

	block(nodes: Node[], scope: Scope): BlockInfo {
		const verb = nodes[0]
		const none: BlockInfo = {
			scoped: false,
			base: null,
			rels: [],
			scopedRels: new Set(),
		}
		if (isWord(verb, 'select')) return this.select(nodes, scope)
		if (isWord(verb, 'insert')) return this.insert(nodes, scope)
		if (isWord(verb, 'update')) return this.update(nodes, scope)
		if (isWord(verb, 'delete')) return this.delete(nodes, scope)
		if (isWord(verb, 'values')) {
			this.scan(nodes, scope)
			return none
		}
		this.error(
			firstPos(nodes),
			`the checker only understands SELECT, INSERT, UPDATE, DELETE and WITH, not "${flatten(
				nodes.slice(0, 2),
			)
				.map((t) => t.v)
				.join(' ')}"`,
		)
		return none
	}

	/** Splits a block at top-level clause keywords (each a list of words). */
	clauses(nodes: Node[], keys: string[]): Map<string, Node[]> {
		const out = new Map<string, Node[]>()
		let current = ''
		out.set(current, [])
		for (let i = 0; i < nodes.length; i++) {
			const n = nodes[i]
			let matched: string | undefined
			for (const key of keys) {
				const words = key.split(' ')
				if (words.every((w, k) => isWord(nodes[i + k], w))) {
					// `x IS [NOT] DISTINCT FROM y` is not a FROM clause.
					if (
						words[0] === 'from' &&
						isWord(nodes[i - 1], 'distinct') &&
						isWord(nodes[i - 2], 'is', 'not')
					)
						continue
					if (!out.has(key)) {
						matched = key
						i += words.length - 1
						break
					}
				}
			}
			if (matched !== undefined) {
				current = matched
				out.set(current, [])
			} else out.get(current)?.push(n)
		}
		return out
	}

	/** Parses a FROM list (or UPDATE ... FROM / DELETE ... USING). */
	from(nodes: Node[], scope: Scope, firstJoin: Rel['join']): Rel[] {
		const rels: Rel[] = []
		splitCommas(nodes).forEach((item, itemIndex) => {
			let i = 0
			let join: Rel['join'] = itemIndex === 0 ? firstJoin : 'inner'
			for (;;) {
				const parsed = this.relation(item, i, scope, join)
				if (!parsed) return
				const rel = parsed.rel
				i = parsed.next
				rels.push(rel)
				// ON / USING
				if (isWord(item[i], 'on')) {
					const start = ++i
					while (i < item.length && !this.joinAt(item, i)) i++
					rel.on = item.slice(start, i)
					this.scan(rel.on, scope)
				} else if (isWord(item[i], 'using')) {
					i++
					if (isGroup(item[i])) i++
					rel.on = []
				}
				if (i >= item.length) return
				const j = this.joinAt(item, i)
				if (!j) {
					this.error(
						item[i].pos,
						`unexpected "${flatten([item[i]])[0]?.v}" in FROM`,
					)
					return
				}
				join = j.type
				i = j.next
			}
		})
		return rels
	}

	/** If a join starts at item[i]: its type and where the relation starts. */
	joinAt(
		item: Node[],
		i: number,
	): { type: Rel['join']; next: number } | undefined {
		let k = i
		if (isWord(item[k], 'natural')) k++
		let type: Rel['join'] = 'inner'
		if (isWord(item[k], 'left')) type = 'left'
		else if (isWord(item[k], 'right')) type = 'right'
		else if (isWord(item[k], 'full')) type = 'full'
		if (isWord(item[k], 'left', 'right', 'full', 'inner', 'cross')) k++
		if (isWord(item[k], 'outer')) k++
		if (!isWord(item[k], 'join')) return undefined
		return { type, next: k + 1 }
	}

	relation(
		item: Node[],
		start: number,
		scope: Scope,
		join: Rel['join'],
	): { rel: Rel; next: number } | undefined {
		let i = start
		if (isWord(item[i], 'lateral')) i++
		if (isWord(item[i], 'only')) i++
		const n = item[i]
		let rel: Rel
		if (isGroup(n)) {
			if (isWord(n.children[0], 'select', 'with', 'values'))
				this.query(n.children, scope)
			else this.scan(n.children, scope)
			rel = {
				kind: 'other',
				name: '(subquery)',
				ref: '(subquery)',
				join,
				on: null,
				role: 'read',
			}
			i++
		} else if (isWord(n)) {
			let nameTok = n
			i++
			if (isOp(item[i], '.') && isWord(item[i + 1])) {
				// schema.table
				this.consumed.add(n)
				nameTok = item[i + 1] as Tok
				i += 2
			}
			this.consumed.add(nameTok)
			const name = nameTok.v
			const args = item[i]
			if (isGroup(args)) {
				// A function in FROM, e.g. generate_series(...).
				this.scan(args.children, scope)
				i++
				rel = {
					kind: 'other',
					name,
					ref: name,
					join,
					on: null,
					role: 'read',
				}
			} else {
				const cte = scope.find((m) => m.has(name))?.get(name)
				if (cte) {
					rel = {
						kind: 'cte',
						name,
						ref: name,
						cte,
						join,
						on: null,
						role: 'read',
					}
				} else {
					rel = {
						kind: 'table',
						name,
						ref: name,
						table: name,
						join,
						on: null,
						role: 'read',
					}
					this.checkKnownTable(nameTok)
				}
			}
		} else {
			this.error(firstPos(item.slice(i)), 'expected a table in FROM')
			return undefined
		}
		if (isWord(item[i], 'as')) i++
		const alias = item[i]
		if (isWord(alias) && !NOT_ALIAS.has(alias.v)) {
			rel.ref = alias.v
			i++
			if (isGroup(item[i])) i++ // column aliases
		}
		return { rel, next: i }
	}

	checkKnownTable(tok: Tok) {
		const rule = this.rule(tok.v)
		if (!rule) {
			this.error(
				tok.pos,
				`unknown table "${tok.v}": add it to TABLES in tests/db/driver-scope.test.ts, saying whether a driver owns its rows`,
			)
		} else if (rule.kind === 'retired') {
			this.error(tok.pos, `table "${tok.v}" is retired (${rule.why})`)
		}
	}

	/* -- Predicates -- */

	/** [qualifier.]column at nodes[i..]: returns it and the next index. */
	colRef(nodes: Node[]): { q: string | null; col: string } | undefined {
		if (nodes.length === 1 && isWord(nodes[0]))
			return { q: null, col: nodes[0].v }
		if (
			nodes.length === 3 &&
			isWord(nodes[0]) &&
			isOp(nodes[1], '.') &&
			isWord(nodes[2])
		)
			return { q: nodes[0].v, col: nodes[2].v }
		return undefined
	}

	/** A bound parameter, optionally cast: `$1` or `$1::text`. Returns its index. */
	param(nodes: Node[]): number | undefined {
		const p = nodes[0]
		if (p?.kind !== 'param') return undefined
		let i = 1
		if (isOp(nodes[i], '::') && isWord(nodes[i + 1])) {
			i += 2
			if (isGroup(nodes[i])) i++
		}
		return i === nodes.length ? p.n : undefined
	}

	/** Whether a hole's TypeScript expression looks like the driver's identity. */
	identityHole(n: number): boolean {
		const text = this.holes[n - 1] ?? ''
		return (
			/^[A-Za-z_$][\w$]*(\??\.[A-Za-z_$][\w$]*)*$/.test(text) &&
			/email/i.test(text.split('.').pop() ?? '')
		)
	}

	/** Splits `a = b` into its two sides, when the whole conjunct is one equality. */
	equality(nodes: Node[]): [Node[], Node[]] | undefined {
		const at = nodes.findIndex((n) => isOp(n, '='))
		if (at <= 0 || nodes.slice(at + 1).some((n) => isOp(n, '=')))
			return undefined
		return [nodes.slice(0, at), nodes.slice(at + 1)]
	}

	/** The relation a column reference names in this block, if any. */
	resolve(
		ref: { q: string | null; col: string },
		rels: Rel[],
	): Rel | undefined {
		if (ref.q !== null) return rels.find((r) => r.ref === ref.q)
		const candidates = rels.filter((r) => {
			const rule = this.driverRule(r.table)
			return (
				rule &&
				(rule.owner === ref.col ||
					rule.key === ref.col ||
					(rule.refs && ref.col in rule.refs))
			)
		})
		return candidates.length === 1 ? candidates[0] : undefined
	}

	/**
	 * Whether `test` holds for some conjunct in every OR branch of a boolean
	 * expression: `a AND (b OR c)` holds only via `a` (or both b and c).
	 */
	holds(nodes: Node[], test: (conjunct: Node[]) => boolean): boolean {
		const disjuncts = this.splitBool(nodes, 'or')
		return disjuncts.every((d) =>
			this.splitBool(d, 'and').some((c) => {
				if (c.length === 1 && isGroup(c[0]))
					return this.holds(c[0].children, test)
				return test(c)
			}),
		)
	}

	/** Splits at a top-level AND or OR, keeping CASE ... END and BETWEEN x AND y whole. */
	splitBool(nodes: Node[], word: 'and' | 'or'): Node[][] {
		const out: Node[][] = [[]]
		let caseDepth = 0
		let between = false
		for (const n of nodes) {
			if (isWord(n, 'case')) caseDepth++
			else if (isWord(n, 'end') && caseDepth > 0) caseDepth--
			if (isWord(n, 'between')) between = true
			if (caseDepth === 0 && isWord(n, word)) {
				if (word === 'and' && between) {
					between = false
				} else {
					out.push([])
					continue
				}
			}
			out[out.length - 1].push(n)
		}
		return out
	}

	/** The block's row filters that apply to `rel`: WHERE, its own ON, other inner joins' ON. */
	filtersFor(rel: Rel, rels: Rel[], where: Node[] | undefined): Node[][] {
		const out: Node[][] = []
		if (where && where.length > 0) out.push(where)
		const outer = rels.some((r) => r.join === 'right' || r.join === 'full')
		for (const r of rels) {
			if (!r.on || r.on.length === 0) continue
			if (r === rel && (r.join === 'inner' || r.join === 'left'))
				out.push(r.on)
			else if (r !== rel && r.join === 'inner' && !outer) out.push(r.on)
		}
		return out
	}

	/** Base driver table of a relation's rows, when they are known to be one driver's. */
	scopedBase(rel: Rel, scoped: Set<Rel>): string | null {
		if (rel.kind === 'table')
			return scoped.has(rel) ? (rel.table ?? null) : null
		if (rel.kind === 'cte' && rel.cte?.scoped) return rel.cte.base
		return null
	}

	/**
	 * Which driver-owned relations in a block are limited to the driver:
	 * directly (`owner = $n`) or through a limited relation joined on a key.
	 */
	scopeRels(rels: Rel[], where: Node[] | undefined): Set<Rel> {
		const scoped = new Set<Rel>()
		const driverRels = rels.filter(
			(r) => r.kind === 'table' && this.driverRule(r.table),
		)
		const how: string[] = []
		const direct = (rel: Rel) => (c: Node[]) => {
			const rule = this.driverRule(rel.table)
			const sides = this.equality(c)
			if (!rule || !sides) return false
			for (const [a, b] of [sides, [sides[1], sides[0]]]) {
				const ref = this.colRef(a)
				const p = this.param(b)
				if (
					ref &&
					p !== undefined &&
					ref.col === rule.owner &&
					this.resolve(ref, rels) === rel
				) {
					if (!this.identityHole(p)) return false
					how.push(`${ref.q ? `${ref.q}.` : ''}${ref.col} = $${p}`)
					return true
				}
			}
			return false
		}
		const reach = (rel: Rel) => (c: Node[]) => {
			const rule = this.driverRule(rel.table)
			const sides = this.equality(c)
			if (!rule || !sides) return false
			for (const [a, b] of [sides, [sides[1], sides[0]]]) {
				const ra = this.colRef(a)
				const rb = this.colRef(b)
				if (!ra || !rb || rb.q === null) continue
				if (this.resolve(ra, rels) !== rel) continue
				const other = this.resolve(rb, rels)
				if (!other || other === rel) continue
				const base = this.scopedBase(other, scoped)
				const baseRule = this.driverRule(base)
				if (!base || !baseRule) continue
				// Same table, same key: the very same row.
				const ok =
					(base === rel.table &&
						ra.col === rule.key &&
						rb.col === rule.key) ||
					// rel's key = a limited row's foreign key to rel's table.
					(ra.col === rule.key &&
						baseRule.refs?.[rb.col] === rel.table) ||
					// rel's foreign key to the limited row's table = that row's key.
					(rule.refs?.[ra.col] === base && rb.col === baseRule.key)
				if (ok) {
					how.push(`joined on ${ra.col} = ${rb.q}.${rb.col}`)
					return true
				}
			}
			return false
		}
		let changed = true
		while (changed) {
			changed = false
			for (const rel of driverRels) {
				if (scoped.has(rel)) continue
				const filters = this.filtersFor(rel, rels, where)
				how.length = 0
				const test = (c: Node[]) => direct(rel)(c) || reach(rel)(c)
				if (filters.some((f) => this.holds(f, test))) {
					scoped.add(rel)
					const as =
						rel.ref === rel.name
							? rel.name
							: `${rel.name} ${rel.ref}`
					this.trace.push(`${as}: ${[...new Set(how)].join(' / ')}`)
					changed = true
				}
			}
		}
		return scoped
	}

	/** Reports driver-owned relations a block doesn't limit to the driver. */
	requireScoped(rels: Rel[], scoped: Set<Rel>, pos: number) {
		for (const rel of rels) {
			const rule = this.driverRule(rel.table)
			if (!rule || scoped.has(rel)) continue
			const as =
				rel.ref === rel.name ? rel.name : `${rel.name} ${rel.ref}`
			const col =
				rel.ref === rel.name ? rule.owner : `${rel.ref}.${rule.owner}`
			this.error(
				pos,
				`${rel.role === 'target' ? 'changes' : 'reads'} ${as} without limiting it to the driver: its WHERE (or ON) must include "${col} = \${driverEmail}" (a bound value, in every OR branch), or join it on its key to a row that is limited`,
			)
		}
	}

	/** Whether rows of the block as a whole are limited to one driver, and their base table. */
	blockScope(
		rels: Rel[],
		scoped: Set<Rel>,
	): { scoped: boolean; base: string | null } {
		if (rels.some((r) => r.join === 'right' || r.join === 'full'))
			return { scoped: false, base: null }
		const limiting = rels.filter(
			(r) => r.join === 'first' || r.join === 'inner',
		)
		const bases = [
			...new Set(
				limiting
					.map((r) => this.scopedBase(r, scoped))
					.filter((b) => b !== null),
			),
		]
		return bases.length === 1
			? { scoped: true, base: bases[0] }
			: { scoped: false, base: null }
	}

	/* -- Statements -- */

	select(nodes: Node[], scope: Scope): BlockInfo {
		const c = this.clauses(nodes.slice(1), [
			'from',
			'where',
			'group by',
			'having',
			'window',
			'order by',
			'limit',
			'offset',
			'fetch',
			'for',
		])
		let list = c.get('') ?? []
		if (isWord(list[0], 'all')) list = list.slice(1)
		if (isWord(list[0], 'distinct'))
			list = list.slice(isWord(list[1], 'on') ? 3 : 1)
		const rels = this.from(c.get('from') ?? [], scope, 'first')
		const where = c.get('where')
		for (const [key, part] of c) if (key !== 'from') this.scan(part, scope)
		const scoped = this.scopeRels(rels, where)
		this.requireScoped(rels, scoped, firstPos(nodes))
		return {
			...this.blockScope(rels, scoped),
			items: splitCommas(list),
			rels,
			scopedRels: scoped,
		}
	}

	/** `name [AS alias]` of an INSERT/UPDATE/DELETE target. */
	target(nodes: Node[], i: number): { rel: Rel; next: number } | undefined {
		if (isWord(nodes[i], 'only')) i++
		let tok = nodes[i]
		if (!isWord(tok)) {
			this.error(firstPos(nodes.slice(i)), 'expected a table name')
			return undefined
		}
		i++
		if (isOp(nodes[i], '.') && isWord(nodes[i + 1])) {
			this.consumed.add(tok)
			tok = nodes[i + 1] as Tok
			i += 2
		}
		this.consumed.add(tok)
		this.checkKnownTable(tok)
		const rel: Rel = {
			kind: 'table',
			name: tok.v,
			ref: tok.v,
			table: tok.v,
			join: 'first',
			on: null,
			role: 'target',
		}
		if (isWord(nodes[i], 'as')) i++
		const alias = nodes[i]
		if (isWord(alias) && !NOT_ALIAS.has(alias.v)) {
			rel.ref = alias.v
			i++
		}
		return { rel, next: i }
	}

	/** SET a = ..., b = ...: no driver-owned row may be given a new owner or parent. */
	assignments(nodes: Node[], table: string, scope: Scope) {
		const rule = this.driverRule(table)
		for (const a of splitCommas(nodes)) {
			const eq = a.findIndex((n) => isOp(n, '='))
			const lhs = flatten(eq < 0 ? a : a.slice(0, eq)).filter(
				(t) => t.kind === 'word',
			)
			if (rule) {
				for (const t of lhs) {
					if (t.v === rule.owner || (rule.refs && t.v in rule.refs)) {
						this.error(
							t.pos,
							`sets ${table}.${t.v}, which would move the row to another driver or trip; that needs a deliberate exception`,
						)
					}
				}
			}
			this.scan(a.slice(eq + 1), scope)
		}
	}

	update(nodes: Node[], scope: Scope): BlockInfo {
		const t = this.target(nodes, 1)
		const none: BlockInfo = {
			scoped: false,
			base: null,
			rels: [],
			scopedRels: new Set(),
		}
		if (!t) return none
		const c = this.clauses(nodes.slice(t.next), [
			'set',
			'from',
			'where',
			'returning',
		])
		if (!c.has('set')) this.error(firstPos(nodes), 'expected SET in UPDATE')
		this.assignments(c.get('set') ?? [], t.rel.name, scope)
		const rels = [t.rel, ...this.from(c.get('from') ?? [], scope, 'inner')]
		const where = c.get('where')
		this.scan(where ?? [], scope)
		this.scan(c.get('returning') ?? [], scope)
		const scoped = this.scopeRels(rels, where)
		this.requireScoped(rels, scoped, firstPos(nodes))
		return {
			scoped: scoped.has(t.rel),
			base: scoped.has(t.rel) ? t.rel.name : null,
			rels,
			scopedRels: scoped,
		}
	}

	delete(nodes: Node[], scope: Scope): BlockInfo {
		const none: BlockInfo = {
			scoped: false,
			base: null,
			rels: [],
			scopedRels: new Set(),
		}
		if (!isWord(nodes[1], 'from')) {
			this.error(firstPos(nodes), 'expected DELETE FROM')
			return none
		}
		const t = this.target(nodes, 2)
		if (!t) return none
		const c = this.clauses(nodes.slice(t.next), [
			'using',
			'where',
			'returning',
		])
		const rels = [t.rel, ...this.from(c.get('using') ?? [], scope, 'inner')]
		const where = c.get('where')
		this.scan(where ?? [], scope)
		this.scan(c.get('returning') ?? [], scope)
		const scoped = this.scopeRels(rels, where)
		this.requireScoped(rels, scoped, firstPos(nodes))
		return {
			scoped: scoped.has(t.rel),
			base: scoped.has(t.rel) ? t.rel.name : null,
			rels,
			scopedRels: scoped,
		}
	}

	/** A select-list item (without `AS alias`) that is a column of a limited relation. */
	scopedColumn(
		item: Node[],
		branch: BlockInfo,
	): { base: string; col: string } | undefined {
		let expr = item
		if (isWord(expr[expr.length - 2], 'as')) expr = expr.slice(0, -2)
		const ref = this.colRef(expr)
		if (!ref) return undefined
		let rel: Rel | undefined
		if (ref.q !== null) rel = branch.rels.find((r) => r.ref === ref.q)
		else if (branch.rels.length === 1) rel = branch.rels[0]
		else {
			const c = branch.rels.filter((r) => {
				const base = this.scopedBase(r, branch.scopedRels)
				const rule = this.driverRule(base)
				return (
					rule &&
					(rule.owner === ref.col ||
						rule.key === ref.col ||
						(rule.refs && ref.col in rule.refs))
				)
			})
			rel = c.length === 1 ? c[0] : undefined
		}
		const base = rel && this.scopedBase(rel, branch.scopedRels)
		return base ? { base, col: ref.col } : undefined
	}

	insert(nodes: Node[], scope: Scope): BlockInfo {
		const none: BlockInfo = {
			scoped: false,
			base: null,
			rels: [],
			scopedRels: new Set(),
		}
		if (!isWord(nodes[1], 'into')) {
			this.error(firstPos(nodes), 'expected INSERT INTO')
			return none
		}
		const t = this.target(nodes, 2)
		if (!t) return none
		let i = t.next
		const table = t.rel.name
		const rule = this.driverRule(table)
		let cols: string[] | null = null
		const colGroup = nodes[i]
		if (
			isGroup(colGroup) &&
			!isWord(colGroup.children[0], 'select', 'with', 'values')
		) {
			cols = splitCommas(colGroup.children).map(
				(c) => flatten(c)[0]?.v ?? '',
			)
			i++
		}
		// The source runs to ON CONFLICT or RETURNING.
		let end = i
		while (
			end < nodes.length &&
			!(isWord(nodes[end], 'on') && isWord(nodes[end + 1], 'conflict')) &&
			!isWord(nodes[end], 'returning')
		)
			end++
		const source = nodes.slice(i, end)
		const pos = firstPos(nodes)
		let ownerOk = false
		const how: string[] = []

		if (rule && !cols)
			this.error(
				pos,
				`inserts into ${table} without a column list, so the checker can't see ${rule.owner}`,
			)
		const ownerIdx = cols?.indexOf(rule?.owner ?? '') ?? -1
		if (rule && cols && ownerIdx < 0)
			this.error(
				pos,
				`inserts into ${table} without setting ${rule.owner}`,
			)
		const refCols =
			rule && cols
				? cols
						.map((c, k) => [c, k] as const)
						.filter(([c]) => rule.refs && c in rule.refs)
				: []

		if (isWord(source[0], 'values')) {
			const before = this.errors.length
			const rows = splitCommas(source.slice(1))
			for (const row of rows) {
				const g =
					row.length === 1 && isGroup(row[0]) ? row[0] : undefined
				const values = g ? splitCommas(g.children) : []
				for (const v of values) this.scan(v, scope)
				if (!rule || ownerIdx < 0) continue
				const p = this.param(values[ownerIdx] ?? [])
				if (p === undefined || !this.identityHole(p)) {
					this.error(
						pos,
						`inserts ${table}.${rule.owner} from something other than the driver's bound email (\${driverEmail})`,
					)
				} else how.push(`$${p}`)
				for (const [c] of refCols) {
					this.error(
						pos,
						`inserts ${table}.${c} from a bound value; select it from a ${rule.refs?.[c]} row the statement limits to the driver instead`,
					)
				}
			}
			ownerOk =
				rule !== undefined &&
				ownerIdx >= 0 &&
				this.errors.length === before
		} else if (
			isWord(source[0], 'select', 'with') ||
			(source.length === 1 && isGroup(source[0]))
		) {
			const q =
				source.length === 1 && isGroup(source[0])
					? this.query(source[0].children, scope)
					: this.query(source, scope)
			if (rule && ownerIdx >= 0) {
				const before = this.errors.length
				for (const branch of q.branches) {
					const item = branch.items?.[ownerIdx]
					if (!item) {
						this.error(
							pos,
							`inserts ${table} from a query the checker can't match to its columns`,
						)
						continue
					}
					const p = this.param(
						isWord(item[item.length - 2], 'as')
							? item.slice(0, -2)
							: item,
					)
					const col = this.scopedColumn(item, branch)
					const fromParam = p !== undefined && this.identityHole(p)
					const fromRow =
						col !== undefined &&
						this.driverRule(col.base)?.owner === col.col
					if (!fromParam && !fromRow) {
						this.error(
							pos,
							`inserts ${table}.${rule.owner} from something other than the driver's bound email or the owner column of a row limited to the driver`,
						)
					} else
						how.push(
							fromParam ? `$${p}` : `${col?.base}.${col?.col}`,
						)
					for (const [c, k] of refCols) {
						const target = rule.refs?.[c]
						const v =
							branch.items?.[k] &&
							this.scopedColumn(branch.items[k], branch)
						const ok =
							v !== undefined &&
							((v.base === target &&
								this.driverRule(target)?.key === v.col) ||
								this.driverRule(v.base)?.refs?.[v.col] ===
									target)
						if (!ok) {
							this.error(
								pos,
								`inserts ${table}.${c} from something other than the key of a ${target} row the statement limits to the driver`,
							)
						}
					}
				}
				ownerOk = this.errors.length === before
			}
		} else if (isWord(source[0], 'default')) {
			if (rule) this.error(pos, `inserts DEFAULT VALUES into ${table}`)
		} else {
			this.error(
				firstPos(source.length ? source : nodes),
				`the checker can't read this INSERT's source`,
			)
		}

		// ON CONFLICT ... and RETURNING ...
		const rest = nodes.slice(end)
		const c = this.clauses(rest, ['on conflict', 'returning'])
		const conflict = c.get('on conflict')
		if (conflict) {
			const doAt = conflict.findIndex((n) => isWord(n, 'do'))
			const targetNodes = conflict.slice(
				0,
				doAt < 0 ? conflict.length : doAt,
			)
			const action = doAt < 0 ? [] : conflict.slice(doAt + 1)
			if (isWord(action[0], 'update')) {
				const ac = this.clauses(action.slice(1), ['set', 'where'])
				this.assignments(ac.get('set') ?? [], table, scope)
				this.scan(ac.get('where') ?? [], scope)
				if (rule) {
					const g = targetNodes[0]
					const words = isGroup(g)
						? flatten(g.children).map((t) => t.v)
						: []
					if (!words.includes(rule.owner)) {
						this.error(
							pos,
							`ON CONFLICT DO UPDATE on ${table} must name ${rule.owner} in its conflict target, or it could update another driver's row`,
						)
						ownerOk = false
					}
				}
			} else if (!isWord(action[0], 'nothing')) {
				this.error(
					pos,
					'expected ON CONFLICT ... DO NOTHING or DO UPDATE',
				)
			}
		}
		this.scan(c.get('returning') ?? [], scope)
		if (rule && ownerOk) {
			const refs = refCols.length
				? ` (${refCols.map(([col]) => col).join(', ')} from a limited row)`
				: ''
			this.trace.push(
				`insert into ${table}: ${rule.owner} from ${[...new Set(how)].join(' / ')}${refs}`,
			)
		}
		return {
			scoped: rule !== undefined && ownerOk,
			base: rule && ownerOk ? table : null,
			rels: [],
			scopedRels: new Set(),
		}
	}
}

/** Checks one statement. Answers its problems (empty when it keeps to the driver's rows). */
export function checkStatement(
	stmt: Pick<SqlStatement, 'text' | 'holes'>,
	tables: Tables,
): { errors: { pos: number; message: string }[]; trace: string[] } {
	let toks: Tok[]
	let tree: Node[]
	try {
		toks = tokenize(stmt.text)
		tree = groupTokens(toks)
	} catch (e) {
		return {
			errors: [
				{
					pos: 0,
					message: `the checker can't read this SQL: ${(e as Error).message}`,
				},
			],
			trace: [],
		}
	}
	const appWords = toks.filter(
		(t) =>
			t.kind === 'word' && (APP_TABLE_PATTERN.test(t.v) || t.v in tables),
	)
	const errors: { pos: number; message: string }[] = []
	// Unknown app-looking names, wherever they are.
	for (const t of appWords) {
		if (!(t.v in tables)) {
			errors.push({
				pos: t.pos,
				message: `unknown table "${t.v}": add it to TABLES in tests/db/driver-scope.test.ts, saying whether a driver owns its rows`,
			})
		}
	}
	if (errors.length > 0) return { errors, trace: [] }
	// One statement per template (neon runs a single prepared statement).
	while (isOp(tree[tree.length - 1], ';')) tree.pop()
	const semi = tree.find((n) => isOp(n, ';'))
	if (semi)
		return {
			errors: [
				{
					pos: semi.pos,
					message: 'more than one statement in one template',
				},
			],
			trace: [],
		}

	const a = new Analyzer(tables, stmt.holes)
	a.query(tree, [])
	// Every mention of a table must be one the parser understood: a relation,
	// or a qualifier (`PTTrips.tripId`, `RETURNING PTTrips.*`).
	for (let k = 0; k < toks.length; k++) {
		const t = toks[k]
		if (!appWords.includes(t) || a.consumed.has(t)) continue
		if (isOp(toks[k + 1], '.')) continue
		a.error(
			t.pos,
			`"${t.v}" is used where the checker can't tell how; it must appear in FROM, JOIN, INTO, UPDATE or DELETE FROM`,
		)
	}
	return { errors: a.errors, trace: a.trace }
}

/* ---- Running it over the app ---- */

export type Report = {
	statements: SqlStatement[]
	/** Problems not covered by the allow-list. */
	failures: Finding[]
	/** Allow-list entries that no longer excuse anything. */
	stale: AllowEntry[]
	/** Problems the allow-list excused, with the entry. */
	excused: (Finding & { entry: AllowEntry })[]
}

const allows = (entry: AllowEntry, f: { file: string; fn: string }) =>
	entry.file === f.file &&
	(f.fn === entry.fn || f.fn.startsWith(`${entry.fn}#`))

export function checkSources(
	sources: { file: string; source: string }[],
	tables: Tables,
	allowList: AllowEntry[],
): Report {
	const statements: SqlStatement[] = []
	const findings: Finding[] = []
	for (const { file, source } of sources) {
		const found = findSqlStatements(file, source)
		statements.push(...found.statements)
		findings.push(...found.problems)
		for (const stmt of found.statements) {
			for (const e of checkStatement(stmt, tables).errors) {
				findings.push({
					file,
					line: stmt.lineAt(e.pos),
					fn: stmt.fn,
					message: e.message,
				})
			}
		}
	}
	const used = new Set<AllowEntry>()
	const failures: Finding[] = []
	const excused: Report['excused'] = []
	for (const f of findings) {
		const entry = allowList.find((e) => allows(e, f))
		if (entry) {
			used.add(entry)
			excused.push({ ...f, entry })
		} else failures.push(f)
	}
	return {
		statements,
		failures,
		stale: allowList.filter((e) => !used.has(e)),
		excused,
	}
}

export const ROOT = resolve(process.cwd())

/** Every .ts/.tsx file under these directories, as paths from the repository root. */
export function sourceFiles(
	dirs: string[],
	root = ROOT,
): { file: string; source: string }[] {
	const out: { file: string; source: string }[] = []
	for (const dir of dirs) {
		for (const f of readdirSync(join(root, dir), {
			recursive: true,
			encoding: 'utf8',
		})) {
			if (!/\.(ts|tsx|mts|cts)$/.test(f) || /\.d\.ts$/.test(f)) continue
			const full = join(root, dir, f)
			out.push({
				file: relative(root, full).replaceAll('\\', '/'),
				source: readFileSync(full, 'utf8'),
			})
		}
	}
	return out.sort((x, y) => x.file.localeCompare(y.file))
}

/* ---- Reading the migrations ---- */

export type MigrationTable = {
	file: string
	columns: Set<string>
	/** column -> referenced table */
	references: Map<string, string>
}

/** Tables created (and columns added) by the .sql files in a directory. */
export function readMigrations(
	dir: string,
	root = ROOT,
): Map<string, MigrationTable> {
	const tables = new Map<string, MigrationTable>()
	const files = readdirSync(join(root, dir))
		.filter((f) => f.endsWith('.sql'))
		.sort()
	for (const f of files) {
		const nodes = groupTokens(
			tokenize(readFileSync(join(root, dir, f), 'utf8')),
		)
		for (let i = 0; i < nodes.length; i++) {
			if (isWord(nodes[i], 'create') && isWord(nodes[i + 1], 'table')) {
				let k = i + 2
				if (isWord(nodes[k], 'if')) k += 3
				const name = nodes[k]
				const body = nodes[k + 1]
				if (!isWord(name) || !isGroup(body)) continue
				const t: MigrationTable = tables.get(name.v) ?? {
					file: f,
					columns: new Set(),
					references: new Map(),
				}
				for (const def of splitCommas(body.children)) {
					const col = def[0]
					// Table constraints (PRIMARY KEY (...), etc.) aren't columns.
					if (
						!isWord(col) ||
						[
							'primary',
							'unique',
							'constraint',
							'foreign',
							'check',
						].includes(col.v)
					)
						continue
					t.columns.add(col.v)
					const r = def.findIndex((n) => isWord(n, 'references'))
					const target = def[r + 1]
					if (r >= 0 && isWord(target))
						t.references.set(col.v, target.v)
				}
				tables.set(name.v, t)
			} else if (
				isWord(nodes[i], 'alter') &&
				isWord(nodes[i + 1], 'table')
			) {
				const name = nodes[i + 2]
				const t = isWord(name) ? tables.get(name.v) : undefined
				for (
					let k = i + 3;
					k < nodes.length && !isOp(nodes[k], ';');
					k++
				) {
					if (
						isWord(nodes[k], 'add') &&
						isWord(nodes[k + 1], 'column')
					) {
						let c = k + 2
						if (isWord(nodes[c], 'if')) c += 3
						const col = nodes[c]
						if (t && isWord(col)) t.columns.add(col.v)
					}
				}
			}
		}
	}
	return tables
}

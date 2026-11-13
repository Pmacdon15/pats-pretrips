import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2'

/*
 * Amazon SES. The client reads AWS_REGION, AWS_ACCESS_KEY_ID and
 * AWS_SECRET_ACCESS_KEY from the environment itself.
 */

let client: SESv2Client | undefined

export function sesClient() {
	client ??= new SESv2Client({})
	return client
}

/** Sends a raw MIME message. Returns SES's message id. */
export async function sendRawEmail(raw: string) {
	const result = await sesClient().send(
		new SendEmailCommand({
			Content: { Raw: { Data: Buffer.from(raw, 'utf8') } },
		}),
	)
	return result.MessageId ?? null
}

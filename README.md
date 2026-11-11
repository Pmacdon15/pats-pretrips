# Pat's PreTrips 2.0
 
Pat's PreTrips is a web application designed to help truck drivers manage and document their pre-trip inspections. This app allows drivers to record inspection details, track defects, and maintain a history of their pre-trip inspections.
 
## Features
 
- **User Authentication**: Secure login via Google or Email
- **Pre-Trip Management**: Create, view, and manage pre-trip inspection records
- **Defect Tracking**: Document and track vehicle defects
- **Responsive Design**: Works on desktop and mobile devices
 
## Technology Stack
 
- **Frontend**:
  - [Next.js 16](https://nextjs.org/) with [App Router](https://nextjs.org/docs/app)
  - [React 19.2](https://react.dev/)
  - [TailwindCSS 4](https://tailwindcss.com/)
  - [TanStack Query](https://tanstack.com/query/latest) for data fetching
  - [TypeScript](https://www.typescriptlang.org/)
 
- **Backend**:
  - [Next.js API Routes](https://nextjs.org/docs/api-routes/introduction)
  - [Kinde](https://kinde.com/) for authentication
  - [Neon Database](https://neon.tech/) (PostgreSQL)
  - [Zod](https://zod.dev/) for validation
 
## Getting Started
 
### Prerequisites
 
- Node.js 18.x or later
- npm or yarn or bun
- PostgreSQL database (or Neon account)
 
### Installation
 
1. Clone the repository
   ```bash
   git clone https://github.com/pmacdon15/pats-pretrips-2.0.git
   cd pats-pretrips-2.0
   ```
 
2. Install dependencies
   ```bash
   npm install
   # or
   yarn install
   ```
 
3. Set up environment variables
   Create a `.env.local` file with the following variables:
   ```
    DATABASE_URL=

    

    REVERSE_GEOCODING_API_KEY=
   ```
 
4. Set up the database
   Run the SQL script in `sql/makeDb.sql` to create the necessary tables.
 
5. Start the development server
   ```bash
   npm run dev
   # or
   bun dev
   ```
 
6. Open [http://localhost:3000](http://localhost:3000) in your browser to see the application.
 
## Database Schema
 
The application uses a Neon PostgreSQL database with the following main table:
 
- **PTTrips**: Stores pre-trip inspection data including driver information, vehicle details, defects, and remarks.
- **DB Schema** found at \lib\sql\makeDb.sql
 
## O Auth Providers

1. Google


## Deployment
 
This project is ready to deploy on [Vercel](https://vercel.com):
 
1. Push your code to GitHub or GitLab
2. Import the project in Vercel
3. Create a Neon Db
4. Sign up for [geoapify.com](https:.geoapify.com)
5. Configure environment variables with geoapify, and O Auth credentials
6. Deploy
 
## Running Tests

Tests use [Vitest](https://vitest.dev) and React Testing Library. The setup matches the invoices and clock-out-2 apps.

```bash
bun run test            # every project
bun run test:watch      # rerun on change
bun run test:coverage   # with the 100% coverage gate
bun run test:build      # next build, then check every page keeps a static shell
bun run typecheck
```

The suite is split into Vitest projects (see `vitest.config.mts`):

- `unit`: `tests/lib`, `tests/db`, `tests/dal`, `tests/actions`, plus `tests/no-async-pages.test.ts`, which fails if any page, layout or other route component under `src/app` is `async`.
- `components`: `tests/components`, rendered in jsdom.
- `app`: `tests/app`, covering pages, the layout, `proxy.ts` and the auth route.
- `build`: `tests/build/static-shell.test.ts`, which reads `.next/` after `next build`.

The database is never hit: `tests/db/sql-mock.ts` stands in for the `neon()` tagged template and records every query. In CI (`.github/workflows/tests.yml`), each project runs as its own job. A final job merges their coverage and fails below 100%. `scripts/check-untested-files.ts` then catches any source file that no test imports.

## Contact

- Email: patrick@patmac.ca
- GitHub: [pmacdon15](https://github.com/pmacdon15)

## License
 
This project is licensed under the MIT License - see the LICENSE file for details.
 
## Acknowledgments
 
- Built with Next.js, React, and other modern web technologies
- Created for truck drivers to simplify the pre-trip inspection process
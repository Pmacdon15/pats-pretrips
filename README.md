# Pat's PreTrips 2.0
 
Pat's PreTrips is a web application designed to help truck drivers manage and document their pre-trip inspections. This app allows drivers to record inspection details, track defects, and maintain a history of their pre-trip inspections.
 
## Features
 
- **User Authentication**: Secure login via GitHub, GitLab, or Discord
- **Pre-Trip Management**: Create, view, and manage pre-trip inspection records
- **Defect Tracking**: Document and track vehicle defects
- **Driver-specific Views**: Each driver can see their own inspection history
- **Responsive Design**: Works on desktop and mobile devices
 
## Technology Stack
 
- **Frontend**:
  - [Next.js 15](https://nextjs.org/) with [App Router](https://nextjs.org/docs/app)
  - [React 19](https://react.dev/)
  - [TailwindCSS 4](https://tailwindcss.com/)
  - [TanStack Query](https://tanstack.com/query/latest) for data fetching
  - [TypeScript](https://www.typescriptlang.org/)
 
- **Backend**:
  - [Next.js API Routes](https://nextjs.org/docs/api-routes/introduction)
  - [NextAuth.js](https://next-auth.js.org/) for authentication
  - [Neon Database](https://neon.tech/) (PostgreSQL)
  - [Zod](https://zod.dev/) for validation
 
## Getting Started
 
### Prerequisites
 
- Node.js 18.x or later
- npm or yarn
- PostgreSQL database (or Neon account)
 
### Installation
 
1. Clone the repository
   ```bash
   git clone https://github.com/yourusername/pats-pretrips-2.0.git
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

    AUTH_DISCORD_ID=
    AUTH_DISCORD_SECRET=
    
    AUTH_GITHUB_ID=
    AUTH_GITHUB_SECRET=

    AUTH_GITLAB_ID=
    AUTH_GITLAB_SECRET=

    AUTH_GOOGLE_ID=
    AUTH_GOOGLE_SECRET=

    AUTH_TWITTER_ID=
    AUTH_TWITTER_SECRET=

    AUTH_SECRET=

    REVERSE_GEOCODING_API_KEY=
   ```
 
4. Set up the database
   Run the SQL script in `sql/makeDb.sql` to create the necessary tables.
 
5. Start the development server
   ```bash
   npm run dev
   # or
   yarn dev
   ```
 
6. Open [http://localhost:3000](http://localhost:3000) in your browser to see the application.
 
## Database Schema
 
The application uses a PostgreSQL database with the following main table:
 
- **PTTrips**: Stores pre-trip inspection data including driver information, vehicle details, defects, and remarks.
- **DB Schema** fround at sql\makeDb.sql
 
## O Auth Providers

1. Google
2. GitHub
3. Gitlab
4. Discord

## Deployment
 
This project is ready to deploy on [Vercel](https://vercel.com):
 
1. Push your code to GitHub or GitLab
2. Import the project in Vercel
3. Sign up for [geoapify.com](https:.geoapify.com)
4. Configure environment variables with geoapify, and O Auth credentials
5. Deploy
 
## License
 
This project is licensed under the MIT License - see the LICENSE file for details.
 
## Acknowledgments
 
- Built with Next.js, React, and other modern web technologies
- Created for truck drivers to simplify the pre-trip inspection process
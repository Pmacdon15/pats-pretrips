import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google'
import GitHub from 'next-auth/providers/github';
import GitLab from 'next-auth/providers/gitlab'
import Discord from 'next-auth/providers/discord';
import Twitter from 'next-auth/providers/twitter';

export const { auth, handlers, signIn, signOut } = NextAuth({
    providers: [Google, GitHub, GitLab, Discord, Twitter],
    trustHost: true,
})
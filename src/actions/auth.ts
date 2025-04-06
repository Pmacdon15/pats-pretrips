'use server'
import { signIn, signOut } from '@/auth';
import { auth } from "@/auth";
import { redirect } from 'next/navigation';

export const loginGithub = async () => {
    await signIn('github', { redirectTo: '/' });  
};

export const loginGitlab = async () => {
    await signIn('gitlab', { redirectTo: '/' }); 
};

export const loginDiscord = async () => {
    await signIn('discord', { redirectTo: '/' }); 
};

export const logout = async () => {
    await signOut({ redirectTo: '/' });  
};



export async function checkIsAuthorized(sessionEmail: string | undefined | null, userEmail: string) {
  if (sessionEmail != userEmail) redirect("/")
}

export async function isSession(userEmail: string) {
    const session = await auth();
    if (!session || session.user?.email != userEmail) redirect('/')
}

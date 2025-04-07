'use client';
import { loginGoogle, loginGithub, loginGitlab, loginDiscord, loginTwitter, logout } from '@/actions/auth'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faGoogle, faGithub, faGitlab, faDiscord, faTwitter } from '@fortawesome/free-brands-svg-icons';
import { Session } from '@auth/core/types';

interface Props {
    session: Session | null;
}

export default function Authbutton({ session }: Props) {
    return (
        <>
            <div className='flex flex-wrap gap-4 w-full '>
                {!session ? (
                    <div className='flex flex-col md:flex-row gap-2 p-4 w-full'>
                        <button className='flex items-center justify-center border p-2 rounded-sm shadow-lg' onClick={() => loginGoogle()}>
                            <FontAwesomeIcon icon={faGoogle} className="mr-2" />
                            Sign In With Google
                        </button >
                        <button className='flex items-center border p-2 rounded-sm shadow-lg justify-center' onClick={() => loginGithub()}>
                            <FontAwesomeIcon icon={faGithub} className="mr-2" />
                            Sign In With GitHub
                        </button >
                        <button className='flex items-center border p-2 rounded-sm shadow-lg justify-center' onClick={() => loginGitlab()}>
                            <FontAwesomeIcon icon={faGitlab} className="mr-2" />
                            Sign In With GitLab
                        </button >
                        <button className='flex items-center border p-2 rounded-sm shadow-lg justify-center' onClick={() => loginDiscord()}>
                            <FontAwesomeIcon icon={faDiscord} className="mr-2" />
                            Sign In With Discord
                        </button >
                        <button className='flex items-center border p-2 rounded-sm shadow-lg justify-center' onClick={() => loginTwitter()}>
                            <FontAwesomeIcon icon={faTwitter} className="mr-2" />
                            Sign In With Twitter
                        </button >
                    </div>
                ) : (
                    <button className='border p-4 shadow-sm rounded-sm ' onClick={() => logout()}>Sign Out</button>
                )}
            </div>
        </>
    );
};
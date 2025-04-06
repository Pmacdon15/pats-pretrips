'use client';
import { loginGoogle, loginGithub, loginGitlab, loginDiscord, logout  } from '@/actions/auth'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faGoogle, faGithub, faGitlab, faDiscord } from '@fortawesome/free-brands-svg-icons';
import { Session } from '@auth/core/types';

interface Props {
    session: Session | null;
}

export default function Authbutton({ session }: Props) {
    return (
        <>
            <div className='flex flex-wrap p-4 gap-4 '>
                {!session ? (
                    <div className='flex flex-col md:flex-row gap-4 p-4'>
                        <button className='flex items-center border p-4 rounded-sm shadow-lg' onClick={() => loginGoogle()}>
                            <FontAwesomeIcon icon={faGoogle} className="mr-2" />
                            Sign In With Google
                        </button >
                        <button className='flex items-center border p-4 rounded-sm shadow-lg' onClick={() => loginGithub()}>
                            <FontAwesomeIcon icon={faGithub} className="mr-2" />
                            Sign In With GitHub
                        </button >                        
                        <button className='flex items-center border p-4 rounded-sm shadow-lg' onClick={() => loginGitlab()}>
                            <FontAwesomeIcon icon={faGitlab} className="mr-2" />
                            Sign In With GitLab
                        </button >
                        <button className='flex items-center border p-4 rounded-sm shadow-lg' onClick={() => loginDiscord()}>
                            <FontAwesomeIcon icon={faDiscord} className="mr-2" />
                            Sign In With Discord
                        </button >
                    </div>
                ) : (
                    <button className='border p-4 shadow-sm rounded-sm ' onClick={() => logout()}>Sign Out</button>
                )}
            </div>
        </>
    );
};
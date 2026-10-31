// Native form association for password managers. Declare owns layout and submission;
// these external form owners supply the browser's credential-saving boundary.
export function associateCredentialForm(): void {
 const password=document.querySelector<HTMLInputElement>('input[autocomplete="current-password"]');
 if(!password || password.form)return;
 let host: HTMLElement | null=password.parentElement;
 let email: HTMLInputElement | null=null;
 while(host && !email){email=host.querySelector<HTMLInputElement>('input[autocomplete="email"]');if(!email)host=host.parentElement}
 const form=document.createElement('form'); form.id='venue-credentials';form.hidden=true;
 form.addEventListener('submit',e=>e.preventDefault());document.body.appendChild(form);
 password.setAttribute('form',form.id);email?.setAttribute('form',form.id);
}

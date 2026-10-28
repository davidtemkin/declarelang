import { Outlet, ScrollRestoration } from 'react-router'
import { BookingProvider } from '../booking'
import { AnnouncerProvider } from './Announcer'
import { Header } from './Header'
import { SignInProvider } from './SignIn'
import styles from './AppShell.module.css'

export function AppShell() {
  return (
    <AnnouncerProvider>
      <BookingProvider>
        <SignInProvider>
          <a className={styles.skip} href="#main">
            Skip to content
          </a>
          <Header />
          <main id="main" tabIndex={-1} className={styles.main}>
            <Outlet />
          </main>
          <ScrollRestoration />
        </SignInProvider>
      </BookingProvider>
    </AnnouncerProvider>
  )
}

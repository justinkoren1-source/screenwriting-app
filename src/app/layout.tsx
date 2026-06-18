import type { Metadata } from 'next'
import { Courier_Prime } from 'next/font/google'
import './globals.css'

const courierPrime = Courier_Prime({
  weight: ['400', '700'],
  style: ['normal', 'italic'],
  subsets: ['latin'],
  variable: '--font-courier-prime',
})

export const metadata: Metadata = {
  title: 'Screenplay',
  description: 'Write your screenplay',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={courierPrime.variable}>
      <body className="min-h-screen">{children}</body>
    </html>
  )
}

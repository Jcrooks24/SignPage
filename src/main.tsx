import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import SignPage from '../SignPage'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SignPage />
  </StrictMode>,
)

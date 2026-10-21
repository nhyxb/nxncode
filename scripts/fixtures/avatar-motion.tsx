import React from 'react'
import {createRoot} from 'react-dom/client'
import {Avatar,defaultLook} from '../../src/renderer/Avatar'
import '../../src/renderer/style.css'

// Explicit component fixture, never imported by the app or packaged in releases.
createRoot(document.getElementById('root')!).render(<aside className="sidebar">
 {['working','watching','sleeping','idle'].map(mood=><div className="bot-row" key={mood}>
  <Avatar look={defaultLook} mood={mood}/><span>{mood}</span>
 </div>)}
</aside>)

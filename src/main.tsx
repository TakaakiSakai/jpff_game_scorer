import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

import { Amplify } from 'aws-amplify'
import outputs from '../amplify_outputs.json' // 生成物
Amplify.configure(outputs) // これで Auth/Data に接続

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

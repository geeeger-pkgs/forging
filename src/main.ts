import { createApp } from 'vue'
import App from './App.vue'
import { boot, startLoop } from './app/store'
import './ui/styles/theme.css'

boot()
startLoop()
createApp(App).mount('#app')

import { createRouter, createWebHistory } from 'vue-router'
import OneToOne from './views/oneToOne.vue'

const routes = [
  { path: '/oneToOne', component: OneToOne },
]

const router = createRouter({
  history: createWebHistory(),
  routes, 
})

export default router
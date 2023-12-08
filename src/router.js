import { createRouter, createWebHistory } from 'vue-router'
import OneToOne from './views/oneToOne.vue'
import OneToMany from './views/OneToMany.vue'

const routes = [
  { path: '/oneToOne', component: OneToOne },
  { path: '/oneToMany', component: OneToMany },
]

const router = createRouter({
  history: createWebHistory(),
  routes, 
})

export default router
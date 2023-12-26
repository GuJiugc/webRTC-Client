import { createRouter, createWebHistory } from 'vue-router'
import OneToOne from './views/oneToOne.vue'
import OneToMany from './views/OneToMany.vue'
import OneToManyVirtual from './views/OneToManyVirtual.vue'
import ManyToMany from './views/ManyToMany.vue'
import JanusPro from './views/janusPro.vue'

const routes = [
  { path: '/oneToOne', component: OneToOne },
  { path: '/oneToMany', component: OneToMany },
  { path: '/OneToManyVirtual', component: OneToManyVirtual },
  { path: '/ManyToMany', component: ManyToMany },
  { path: '/JanusPro', component: JanusPro },
]

const router = createRouter({
  history: createWebHistory(),
  routes, 
})

export default router
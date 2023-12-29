import { createRouter, createWebHistory } from 'vue-router'
import OneToOne from './views/oneToOne.vue'
import OneToMany from './views/OneToMany.vue'
import OneToManyVirtual from './views/OneToManyVirtual.vue'
import ManyToMany from './views/ManyToMany.vue'
import JanusPro from './views/janusPro.vue'
import JanusMeeting from './views/janusMeeting.vue'
import SRS from './views/SRS.vue'
import PullStream from './views/pullStream.vue'

const routes = [
  { path: '/oneToOne', component: OneToOne },
  { path: '/oneToMany', component: OneToMany },
  { path: '/OneToManyVirtual', component: OneToManyVirtual },
  { path: '/ManyToMany', component: ManyToMany },
  { path: '/JanusPro', component: JanusPro },
  { path: '/JanusMeeting', component: JanusMeeting },
  { path: '/SRS', component: SRS },
  { path: '/PullStream', component: PullStream },
]

const router = createRouter({
  history: createWebHistory(),
  routes, 
})

export default router
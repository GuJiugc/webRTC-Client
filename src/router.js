import { createRouter, createWebHistory } from 'vue-router'
import OneToOne from './views/oneToOne.vue'
import OneToMany from './views/OneToMany.vue'
import OneToManyVirtual from './views/OneToManyVirtual.vue'
import ManyToMany from './views/ManyToMany.vue'
import JanusPro from './views/janusPro.vue'
import JanusMeeting from './views/janusMeeting.vue'
import SRS from './views/SRS.vue'
import PullStream from './views/pullStream.vue'
import SRSMeeting from './views/SRSMeeting.vue'
import SRSLive from './views/SRSLive.vue'

const routes = [
  { path: '/oneToOne', component: OneToOne },
  { path: '/oneToMany', component: OneToMany },
  { path: '/OneToManyVirtual', component: OneToManyVirtual },
  { path: '/ManyToMany', component: ManyToMany },
  { path: '/JanusPro', component: JanusPro },
  { path: '/JanusMeeting', component: JanusMeeting },
  { path: '/SRS', component: SRS },
  { path: '/PullStream', component: PullStream },
  { path: '/SRSMeeting', component: SRSMeeting },
  { path: '/SRSLive', component: SRSLive },
]

const router = createRouter({
  history: createWebHistory(),
  routes, 
})

export default router
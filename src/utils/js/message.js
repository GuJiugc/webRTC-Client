import { Snackbar } from '@varlet/ui'

export function $msg(type, msg) {
    Snackbar[type](msg)
}
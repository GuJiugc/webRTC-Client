<template>
    <div class="iptContainer">
      <div>
        <var-input placeholder="请输入昵称" v-model="nickName" clearable/>
      </div>
      <div>
        <var-input placeholder="请输入房间号" v-model="roomId" clearable/>
      </div>
      <var-button style="margin-top: 10px;float: right;" type="primary" @click="init">加入房间</var-button>
    </div>
    <video ref="localVideoRef"></video>
    
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { io } from "socket.io-client";
import { v4 as uuidv4 } from 'uuid';

var localVideoRef = ref()
var userId = uuidv4()
var nickName = ref('')
var roomId = ref('')
var ServerUrl = 'ws://localhost:18080'
var socket = ref()
var userInfo = ref({})
var log = console.log

function getShareSqeenStream() {
  return navigator.mediaDevices.getDisplayMedia({
    audio: true
  })
}

function init() {
  userInfo.value = {
    userId: userId,
    nickName: nickName.value,
    roomId: roomId.value
  }

  socket.value = io(ServerUrl, {
		reconnectionDelayMax: 10000, // 重连超时时间
    query: {
      userId,
      roomId: roomId.value,
      nickName: nickName.value
    }
  })

  socket.value.on('connect', (e) => {
    log('socket connect success', socket.value)
  })

  socket.value.on('msg', (msg) => {
    console.log(msg)
  })

}

// 获取参数
function getParams(queryName) {
  let url = window.location.href
  let query = decodeURI(url.split('?')[1])
  let vars = query.split('&')
  for (var i = 0; i < vars.length; i++) {
    var pair = vars[i].split('=')
    if (pair[0] === queryName) {
      return pair[1]
    }
  }
  return null
}

// 设置本地媒体流
function setDomVideoStream(domId, newStream) {
  let video = domId.value
  let stream = video.srcObject
  if (stream) {
    stream.getAudioTracks().forEach((e) => {
      stream.removeTrack()
    })
    stream.getVideoTracks().forEach((e) => {
      stream.removeTrack()
    })
  }
}

// 设置远程媒体流
</script>

<style lang="less" scoped>
.iptContainer {
  width: 300px;
}
</style>

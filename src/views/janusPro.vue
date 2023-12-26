<template>
  <div class="iptContainer">
    <div class="flex">
      <var-input placeholder="请输入昵称" v-model="nickName" clearable />
      <var-button style="margin-top: 10px;float: right;" type="primary" @click="registerUser">注册</var-button>
    </div>
    <div class="flex">
      <var-input placeholder="请输入呼叫方名字" v-model="targetUserName" clearable />
      <var-button style="margin-top: 10px;float: right;" type="primary" @click="call">呼叫</var-button>
    </div>
  </div>

  <div>
    <div>
      <div>本地：</div>
      <video ref="localVideoRef" width="500"></video>
    </div>
    <var-button style="margin-top: 10px;float: right;" type="primary" @click="controlVideo">控制视频</var-button>
    <div>
      <div>远端：</div>
      <video ref="remoteVideoRef" width="500"></video>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import adapter from 'webrtc-adapter';
import Janus from "../utils/js/Janus";
import { $msg } from '../utils/js/message.js'

var localVideoRef = ref()
var remoteVideoRef = ref()
let mediaStream = null
let targetUserName = ref('')
let nickName = ref('')
let log = console.log
let janus = null
let opaqueId = "videocall-" + Janus.randomString(12);
let audioStatus = ref(true)
let videoStatus = true

function getShareSqeenStream() {
  return navigator.mediaDevices.getUserMedia({
    video: true,
    audio: true
  })
  // return navigator.mediaDevices.getDisplayMedia({
  //   audio: true,
  //   video: true
  // })
}

function initJanus() {
  Janus.init({
    debug: true,
    dependencies: Janus.useDefaultDependencies({
      adapter: adapter
    }),
    callback: () => {
      if (!Janus.isWebrtcSupported()) {
        Janus.log('is not supported webrtc!')
        return
      }
    }
  })

  log(opaqueId, 'opaqueId')
  janus = new Janus({
    server: 'http://192.168.124.130:18088/janus',
    apisecret: 'biasecret',
    success: function () {
      Janus.log("初始化成功")
      initVideoCallPlugin()
    },
    error: function (cause) {
      // Error, can't go on...
      Janus.log(cause)
    },
    destroyed: function () {
      // I should get rid of this
      Janus.log("destroyed")
    }
  })
}
let videoCallPluginHandle = null
function initVideoCallPlugin() {
  janus.attach({
    opaqueId: opaqueId,
    plugin: "janus.plugin.videocall",
    success: function (pluginHandle) {
      //插件初始化成功后 pluginHandle 就是全局句柄，通过 pluginHandle可以操作当前
      //会话的所有功能
      videoCallPluginHandle = pluginHandle
      console.log("视频插件初始化成功")
      // setInterval(() => {
      // 	that.getBitrate()
      // },1500)
      // console.log("视频呼叫插件初始化成功",videoCallPluginHandle)
    },
    error: function (cause) {
      //插件初始化失败
      log('初始化失败')
    },
    onmessage: function (msg, jsep) {
      //msg 交互信息包括挂断 接听等事件监听
      // jsep  协商信令
      log('onmessage')
      onMessageForVideoCall(msg, jsep)

    },
    onlocaltrack: function (track, added) {
      // 本地媒体流发布后可以监听
      console.log("本地媒体", track, added)
      if (added === true) {
        setDomVideoTrick(localVideoRef.value, track)
      }

    },
    onremotetrack: function (track, mid, added) {
      // 远端媒体流
      console.log("远程媒体", track, mid, added)
      if (added === true) {
        setDomVideoTrick(remoteVideoRef.value, track)
      }
    },
    oncleanup: function () {
      log('cleanup')
      // PeerConnection 关闭监听
      // 同时可以创建信的句柄(旧的可用)重新初始化
    },
    detached: function () {
      log('detached')
      // PeerConnection 关闭监听
      // 同时可以创建信的句柄（旧的不可用）重新初始化
    }
  });
}

function setDomVideoTrick(domRef, track) {
  let video = domRef
  let stream = video.srcObject
  if (stream) {
    stream.addTrack(track)
  } else {
    stream = new MediaStream()
    stream.addTrack(track)
    video.srcObject = stream
    video.controls = false;
    video.autoplay = true;
  }
}

function onMessageForVideoCall(msg, jsep) {
  log(":::get a message:::")
  var result = msg["result"]
  console.log(msg)
  if(result) {
    if(result["list"]) {
      var list = result["list"]
      log("注册Peers", list)
    }else if(result["event"]){
      var event = result["event"]
      if(event === "registered") {
        console.log("注册成功", msg)
        videoCallPluginHandle.send({message: {request: "list"}})
      }else if(event === "calling") {
        log("呼叫中")
        $msg("warning", "呼叫中，请稍后")
      }else if(event === "incomingcall") {
        let username = result["username"]
        log("来自" + username + "的呼叫")
        videoCallPluginHandle.createAnswer({
          media: mediaStream,
          jsep: jsep,
          tracks: [
            { type: 'audio', capture: true, recv: true },
            { type: 'video', capture: true, recv: true },
            { type: 'data' },
          ],
          success: function(jsep) {
            Janus.debug("应答 SDP", jsep)
            var body = { request: "accept" }
            videoCallPluginHandle.send({ message: body, jsep })
          },
          error: function(err) {
            log("创建应答异常", err)
          }
        })
      }else if(event === "accepted") {
        log("对方已接听同时设置协商信息", jsep)
        if(jsep) {
          videoCallPluginHandle.handleRemoteJsep({jsep})
        }
        $msg("success", "对方已接听")
      }else if(event === "update") {
        if(jsep) {
          if(jsep.type === "answer") {
            videoCallPluginHandle.handleRemoteJsep({jsep})
          }else {
            videoCallPluginHandle.createAnswer({
            media: mediaStream,
            jsep: jsep,
            tracks: [
              { type: 'audio', capture: true, recv: true },
              { type: 'video', capture: true, recv: true },
              { type: 'data' },
            ],
            success: function(jsep) {
              Janus.debug("重新应答信令 SDP", jsep)
              var body = { request: "accept" }
              videoCallPluginHandle.send({ message: body, jsep })
            },
            error: function(err) {
              log("创建应答异常", err)
            }
          })
          }
        }
      }else if(event === "hangup") {
        log(`${result["username"]}已挂断，原始：（${result["reason"]}）！`)
        videoCallPluginHandle.hangup()
        $msg("warning", "已挂断")
        clearMedia()
      } else if(event === "simulcast") {
          console.log("联播simulcast，暂时不用考虑",msg)
        }
    }
  } else{
     // 出错
     var error = msg["error"]
     log("未知异常", msg)
     videoCallPluginHandle.hangup()
  }
}

function clearMedia(){
    let local = localVideoRef.value
    if(local && local.srcObject){
      local.srcObject.getTracks().forEach(e => {
        e.stop()
      })
      local.srcObject = null
    }
    let remote = remoteVideoRef.value
    if(remote && remote.srcObject){
      remote.srcObject.getTracks().forEach(e => {
        e.stop()
      })
      remote.srcObject = null
    }
    audioStatus = true
    videoStatus = true
  }

function controlVideo(){
    videoStatus = !videoStatus
    videoCallPluginHandle.send({ message:
      { request: "set", video: videoStatus},
    });
  }

async function registerUser() {
  if (nickName.value == '') {
    return $msg('warning', '请输入昵称')
  }
  mediaStream = await getShareSqeenStream()
  var register = { request: "register", username: nickName.value };
  videoCallPluginHandle.send({ message: register });
}

onMounted(() => {
  initJanus()
})

function call() {
  videoCallPluginHandle.createOffer({
    media: mediaStream,
    // 双向语音视频加datachannel
    track: [
      { type: 'audio', capture: true, recv: true },
      { type: 'video', capture: true, recv: true, simulcast: false },
      { type: 'data' },
    ],
    success: function (jsep) {
      Janus.debug("呼叫端创建 SDP信息", jsep);
      var body = { request: "call", username: targetUserName.value };
      videoCallPluginHandle.send({ message: body, jsep: jsep });
    },
    error: function (err) {
      log('呼叫异常', err)
    }
  })
}

</script>

<style lang="less" scoped>
.iptContainer {
  width: 300px;
  overflow: hidden;
}

.flex {
  display: flex;
}
</style>

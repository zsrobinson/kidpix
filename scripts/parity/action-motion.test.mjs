import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createActionStateController, policyFor } from '../../src/native-action-state.js';
import { createMode2MotionController } from '../../src/native-drawing-motion.js';
// Portable source-authored row/timeline fixtures; no extracted media required.
const data = {
  buttons: [
    {"table":18700,"index":0,"name":"mbtn-18700-row-0","stateScripts":[18053,18282,0,0],"command":18702,"rolloverScript":18283,"rolloverParameters":[0,0,0],"rolloverLoops":false,"rolloverCancelsOnLeave":true,"group":18700,"commandArgument":1},
    {"table":18700,"index":1,"name":"mbtn-18700-row-1","stateScripts":[18054,18055,0,18307],"command":18703,"rolloverScript":18056,"rolloverParameters":[0,0,0],"rolloverLoops":false,"rolloverCancelsOnLeave":true,"group":18700,"commandArgument":1},
    {"table":18700,"index":2,"name":"mbtn-18700-row-2","stateScripts":[18057,18058,0,18308],"command":18704,"rolloverScript":18059,"rolloverParameters":[0,0,0],"rolloverLoops":false,"rolloverCancelsOnLeave":true,"group":18700,"commandArgument":1},
    {"table":18700,"index":3,"name":"mbtn-18700-row-3","stateScripts":[18235,18236,0,0],"command":18701,"rolloverScript":18237,"rolloverParameters":[0,0,0],"rolloverLoops":false,"rolloverCancelsOnLeave":true,"group":18700,"commandArgument":0},
    {"table":18202,"index":0,"name":"mbtn-18202-row-0","stateScripts":[18226,18227,0,18227],"command":18200,"rolloverScript":18228,"rolloverParameters":[0,0,0],"rolloverLoops":false,"rolloverCancelsOnLeave":true,"group":18202,"commandArgument":1},
    {"table":18202,"index":1,"name":"mbtn-18202-row-1","stateScripts":[18229,18230,0,18230],"command":18200,"rolloverScript":18231,"rolloverParameters":[0,0,0],"rolloverLoops":false,"rolloverCancelsOnLeave":true,"group":18202,"commandArgument":2},
    {"table":18202,"index":2,"name":"mbtn-18202-row-2","stateScripts":[18232,18233,0,18233],"command":18200,"rolloverScript":18234,"rolloverParameters":[0,0,0],"rolloverLoops":false,"rolloverCancelsOnLeave":true,"group":18202,"commandArgument":3},
    {"table":9383,"index":0,"name":"mbtn-9383-row-0","stateScripts":[18096,18278,0,0],"command":210,"rolloverScript":18279,"rolloverParameters":[0,0,0],"rolloverLoops":false,"rolloverCancelsOnLeave":true,"group":0,"commandArgument":1},
    {"table":9383,"index":1,"name":"mbtn-9383-row-1","stateScripts":[18097,18280,0,0],"command":211,"rolloverScript":18281,"rolloverParameters":[0,0,0],"rolloverLoops":false,"rolloverCancelsOnLeave":true,"group":0,"commandArgument":1},
    {"table":9383,"index":2,"name":"mbtn-9383-row-2","stateScripts":[18098,18099,0,18309],"command":200,"rolloverScript":18100,"rolloverParameters":[0,0,0],"rolloverLoops":false,"rolloverCancelsOnLeave":true,"group":1,"commandArgument":1},
    {"table":9383,"index":3,"name":"mbtn-9383-row-3","stateScripts":[18101,18102,0,18310],"command":201,"rolloverScript":18103,"rolloverParameters":[0,0,0],"rolloverLoops":false,"rolloverCancelsOnLeave":true,"group":1,"commandArgument":1},
    {"table":9383,"index":4,"name":"mbtn-9383-row-4","stateScripts":[18104,18105,0,18311],"command":202,"rolloverScript":18106,"rolloverParameters":[0,0,0],"rolloverLoops":false,"rolloverCancelsOnLeave":true,"group":8,"commandArgument":1},
    {"table":9383,"index":5,"name":"mbtn-9383-row-5","stateScripts":[18107,18108,0,18312],"command":203,"rolloverScript":18109,"rolloverParameters":[0,0,0],"rolloverLoops":false,"rolloverCancelsOnLeave":true,"group":8,"commandArgument":1},
    {"table":9383,"index":6,"name":"mbtn-9383-row-6","stateScripts":[18119,18120,0,18120],"command":204,"rolloverScript":18121,"rolloverParameters":[0,0,0],"rolloverLoops":false,"rolloverCancelsOnLeave":true,"group":2,"commandArgument":0},
    {"table":9383,"index":7,"name":"mbtn-9383-row-7","stateScripts":[18125,18126,0,18126],"command":206,"rolloverScript":18127,"rolloverParameters":[0,0,0],"rolloverLoops":false,"rolloverCancelsOnLeave":true,"group":2,"commandArgument":0},
    {"table":9383,"index":8,"name":"mbtn-9383-row-8","stateScripts":[18122,18123,0,18123],"command":205,"rolloverScript":18124,"rolloverParameters":[0,0,0],"rolloverLoops":false,"rolloverCancelsOnLeave":true,"group":2,"commandArgument":0},
    {"table":9383,"index":9,"name":"mbtn-9383-row-9","stateScripts":[18110,18111,18111,0],"command":207,"rolloverScript":18112,"rolloverParameters":[0,0,0],"rolloverLoops":false,"rolloverCancelsOnLeave":true,"group":5,"commandArgument":0},
    {"table":9383,"index":10,"name":"mbtn-9383-row-10","stateScripts":[18113,18114,18114,0],"command":208,"rolloverScript":18115,"rolloverParameters":[0,0,0],"rolloverLoops":false,"rolloverCancelsOnLeave":true,"group":6,"commandArgument":0},
    {"table":9383,"index":11,"name":"mbtn-9383-row-11","stateScripts":[18116,18117,18117,0],"command":209,"rolloverScript":18118,"rolloverParameters":[0,0,0],"rolloverLoops":false,"rolloverCancelsOnLeave":true,"group":7,"commandArgument":0},
    {"table":9383,"index":12,"name":"mbtn-9383-row-12","stateScripts":[18191,18192,0,0],"command":240,"rolloverScript":18193,"rolloverParameters":[0,0,0],"rolloverLoops":false,"rolloverCancelsOnLeave":true,"group":3,"commandArgument":0},
    {"table":9383,"index":13,"name":"mbtn-9383-row-13","stateScripts":[18185,18186,0,0],"command":241,"rolloverScript":18187,"rolloverParameters":[0,0,0],"rolloverLoops":false,"rolloverCancelsOnLeave":true,"group":3,"commandArgument":0},
    {"table":9383,"index":14,"name":"mbtn-9383-row-14","stateScripts":[18188,18189,0,0],"command":242,"rolloverScript":18190,"rolloverParameters":[0,0,0],"rolloverLoops":false,"rolloverCancelsOnLeave":true,"group":3,"commandArgument":0},
    {"table":9383,"index":15,"name":"mbtn-9383-row-15","stateScripts":[18238,18239,18239,0],"command":232,"rolloverScript":18240,"rolloverParameters":[0,0,0],"rolloverLoops":false,"rolloverCancelsOnLeave":true,"group":3,"commandArgument":0},
    {"table":9383,"index":16,"name":"mbtn-9383-row-16","stateScripts":[18241,18284,0,0],"command":231,"rolloverScript":18285,"rolloverParameters":[0,0,0],"rolloverLoops":false,"rolloverCancelsOnLeave":true,"group":3,"commandArgument":0},
    {"table":9383,"index":17,"name":"mbtn-9383-row-17","stateScripts":[18242,18243,0,18313],"command":236,"rolloverScript":18244,"rolloverParameters":[0,0,0],"rolloverLoops":false,"rolloverCancelsOnLeave":true,"group":3,"commandArgument":1},
    {"table":9383,"index":18,"name":"mbtn-9383-row-18","stateScripts":[18245,18246,0,18314],"command":237,"rolloverScript":18247,"rolloverParameters":[0,0,0],"rolloverLoops":false,"rolloverCancelsOnLeave":true,"group":3,"commandArgument":1},
    {"table":926,"index":2,"name":"mbtn-926-row-2","stateScripts":[18194,18195,0,0],"command":22352,"rolloverScript":18196,"rolloverParameters":[1,0,0],"rolloverLoops":true,"rolloverCancelsOnLeave":true,"group":152,"commandArgument":0},
    {"table":926,"index":3,"name":"mbtn-926-row-3","stateScripts":[18185,18186,0,0],"command":22350,"rolloverScript":18187,"rolloverParameters":[1,0,0],"rolloverLoops":true,"rolloverCancelsOnLeave":true,"group":152,"commandArgument":0},
    {"table":926,"index":4,"name":"mbtn-926-row-4","stateScripts":[18188,18189,0,0],"command":22351,"rolloverScript":18190,"rolloverParameters":[1,0,0],"rolloverLoops":true,"rolloverCancelsOnLeave":true,"group":152,"commandArgument":0},
    {"table":926,"index":5,"name":"mbtn-926-row-5","stateScripts":[18358,18359,0,0],"command":22355,"rolloverScript":18360,"rolloverParameters":[1,0,0],"rolloverLoops":true,"rolloverCancelsOnLeave":true,"group":152,"commandArgument":0},
    {"table":926,"index":6,"name":"mbtn-926-row-6","stateScripts":[18361,18362,0,0],"command":22356,"rolloverScript":18363,"rolloverParameters":[1,0,0],"rolloverLoops":true,"rolloverCancelsOnLeave":true,"group":152,"commandArgument":0},
    {"table":926,"index":7,"name":"mbtn-926-row-7","stateScripts":[18364,18365,0,0],"command":22357,"rolloverScript":18366,"rolloverParameters":[1,0,0],"rolloverLoops":true,"rolloverCancelsOnLeave":true,"group":152,"commandArgument":0},
    {"table":926,"index":8,"name":"mbtn-926-row-8","stateScripts":[18367,18368,0,0],"command":22358,"rolloverScript":18369,"rolloverParameters":[1,0,0],"rolloverLoops":true,"rolloverCancelsOnLeave":true,"group":152,"commandArgument":0},
    {"table":926,"index":9,"name":"mbtn-926-row-9","stateScripts":[18370,18371,0,0],"command":22359,"rolloverScript":18372,"rolloverParameters":[1,0,0],"rolloverLoops":true,"rolloverCancelsOnLeave":true,"group":152,"commandArgument":0},
    {"table":926,"index":10,"name":"mbtn-926-row-10","stateScripts":[18373,18374,0,0],"command":22360,"rolloverScript":18375,"rolloverParameters":[1,0,0],"rolloverLoops":true,"rolloverCancelsOnLeave":true,"group":152,"commandArgument":0},
    {"table":926,"index":11,"name":"mbtn-926-row-11","stateScripts":[18377,18378,0,0],"command":22361,"rolloverScript":18379,"rolloverParameters":[0,0,0],"rolloverLoops":false,"rolloverCancelsOnLeave":true,"group":152,"commandArgument":0}
  ],
  scripts: {
    "18053": {"script":18053,"tickMs":100,"frames":[{"tick":0,"parts":[]}],"sounds":[],"endCheckTick":1,"sourceSha256":"00ab8c6a6f6c4238ba26294c5b19b567baf4d762696263a40eeb56db5211b62e"},
    "18054": {"script":18054,"tickMs":100,"frames":[{"tick":0,"parts":[]}],"sounds":[],"endCheckTick":1,"sourceSha256":"f03811ad55e45508dd4128747f84652d698fd812e39ca2ea40cc29a1f2d6c200"},
    "18055": {"script":18055,"tickMs":100,"frames":[{"tick":0,"parts":[]},{"tick":1,"parts":[]}],"sounds":[{"tick":1,"sound":18003,"cue":3,"channel":1}],"endCheckTick":2,"sourceSha256":"0f8bb533619e016d652b346e0070c65751f6757828462ff9d8057239c5a939f2"},
    "18056": {"script":18056,"tickMs":100,"frames":[{"tick":0,"parts":[]}],"sounds":[],"endCheckTick":1,"sourceSha256":"0cd384629216d3fe6eef738683be98d27dfa513f74ccbe771aa9cb0dd4a0dd07"},
    "18057": {"script":18057,"tickMs":100,"frames":[{"tick":0,"parts":[]}],"sounds":[],"endCheckTick":1,"sourceSha256":"7db3387a57385a9a3ac02e32092391ef49533ba8ca3f02c4be9c8aee8310fb0e"},
    "18058": {"script":18058,"tickMs":100,"frames":[{"tick":0,"parts":[]},{"tick":1,"parts":[]}],"sounds":[{"tick":1,"sound":18003,"cue":3,"channel":1}],"endCheckTick":2,"sourceSha256":"077799c504f38d862929a8397afec9879e8a0cd3319158eb2103d1844f618ab6"},
    "18059": {"script":18059,"tickMs":100,"frames":[{"tick":0,"parts":[]}],"sounds":[],"endCheckTick":1,"sourceSha256":"f01085d810d882d8ec4ce8f2c2a76d5ae67699ceef025e0e3c94b34e1271a31d"},
    "18096": {"script":18096,"tickMs":100,"frames":[{"tick":0,"parts":[]}],"sounds":[],"endCheckTick":1,"sourceSha256":"8fb4ae9dd5941b7c54569679ff45760daf02390f9ea92bdd27035f77caa47981"},
    "18097": {"script":18097,"tickMs":100,"frames":[{"tick":0,"parts":[]}],"sounds":[],"endCheckTick":1,"sourceSha256":"214c9a36824669e7da2dff7ba34653f4e79ff51c8e0bef6d19ede42439be32f9"},
    "18098": {"script":18098,"tickMs":100,"frames":[{"tick":0,"parts":[]}],"sounds":[],"endCheckTick":1,"sourceSha256":"15179590bda53faea74a923835de1604785587f2c137dad093faebcf7fc7fda3"},
    "18099": {"script":18099,"tickMs":100,"frames":[{"tick":0,"parts":[]},{"tick":1,"parts":[]}],"sounds":[{"tick":1,"sound":18003,"cue":3,"channel":1}],"endCheckTick":2,"sourceSha256":"d69d8a72e6d044a4eadfc1131682b29e774c08a0df592a107fc1bd48db3acf5b"},
    "18100": {"script":18100,"tickMs":100,"frames":[{"tick":0,"parts":[]}],"sounds":[],"endCheckTick":1,"sourceSha256":"c5b848c5751cec57e102c05516a72c54eec95f95bc9c99af4ef9cb0e95927870"},
    "18101": {"script":18101,"tickMs":100,"frames":[{"tick":0,"parts":[]}],"sounds":[],"endCheckTick":1,"sourceSha256":"88427ef41a5d133054e6a8890a5c2ece8366fe4315579dcb00bb2d8a0a8c864c"},
    "18102": {"script":18102,"tickMs":100,"frames":[{"tick":0,"parts":[]},{"tick":1,"parts":[]}],"sounds":[{"tick":1,"sound":18003,"cue":3,"channel":1}],"endCheckTick":2,"sourceSha256":"733bf2060a5deca7318c4697140470c4b1a2deb2b4c0c23bf85bab7d6d3b6fa7"},
    "18103": {"script":18103,"tickMs":100,"frames":[{"tick":0,"parts":[]}],"sounds":[],"endCheckTick":1,"sourceSha256":"945bf0dbb017570fe3bd918d174c073d70c3060a65c02bdbc76ce0cf8eee9fce"},
    "18104": {"script":18104,"tickMs":100,"frames":[{"tick":0,"parts":[]}],"sounds":[],"endCheckTick":1,"sourceSha256":"71ae398264556e5a8870e91c479e78882f675c5e799a8d91459229d7e5fff9c1"},
    "18105": {"script":18105,"tickMs":100,"frames":[{"tick":0,"parts":[]},{"tick":1,"parts":[]}],"sounds":[{"tick":1,"sound":18003,"cue":3,"channel":1}],"endCheckTick":2,"sourceSha256":"e23883e4614b436ccec2688a33a1a07d248cefe60e2190912d55421ece3c8efc"},
    "18106": {"script":18106,"tickMs":100,"frames":[{"tick":0,"parts":[]}],"sounds":[],"endCheckTick":1,"sourceSha256":"21e18469502ee002964e208fa482cc4fa2c1d6a15f68df735836a2f451a46e3b"},
    "18107": {"script":18107,"tickMs":100,"frames":[{"tick":0,"parts":[]}],"sounds":[],"endCheckTick":1,"sourceSha256":"33acfab94c84ba227f1911a77c3bac67774926dc156064bc5ffb9f181f9e7607"},
    "18108": {"script":18108,"tickMs":100,"frames":[{"tick":0,"parts":[]},{"tick":1,"parts":[]}],"sounds":[{"tick":1,"sound":18003,"cue":3,"channel":1}],"endCheckTick":2,"sourceSha256":"dc7389776f0c5c2140cecc74af636f4346aa18b541b5fe1bf098c91c86f13413"},
    "18109": {"script":18109,"tickMs":100,"frames":[{"tick":0,"parts":[]}],"sounds":[],"endCheckTick":1,"sourceSha256":"eca7b30a8ffc5d5d9b16da4194099b59fafecd2e6406c7e2bc708ee0363e7d71"},
    "18110": {"script":18110,"tickMs":100,"frames":[{"tick":0,"parts":[]},{"tick":1,"parts":[]}],"sounds":[{"tick":1,"sound":18037,"cue":37,"channel":1}],"endCheckTick":2,"sourceSha256":"ef9ab23d853cfecd72f5adf88e2856702b7d824bb69abda12dd214b13c3ec5ae"},
    "18111": {"script":18111,"tickMs":100,"frames":[{"tick":0,"parts":[]},{"tick":1,"parts":[]}],"sounds":[{"tick":1,"sound":18038,"cue":38,"channel":1}],"endCheckTick":2,"sourceSha256":"2545809a1a27813db12b9ae635b993b8bc791b996569bd0e76ade692626af7e9"},
    "18112": {"script":18112,"tickMs":100,"frames":[{"tick":0,"parts":[]}],"sounds":[],"endCheckTick":1,"sourceSha256":"c14045b5cb6aab2e2a418a9946279fac323e36f2ad50007c894e479df6abcdd1"},
    "18113": {"script":18113,"tickMs":100,"frames":[{"tick":0,"parts":[]},{"tick":1,"parts":[]}],"sounds":[{"tick":1,"sound":18037,"cue":37,"channel":1}],"endCheckTick":2,"sourceSha256":"565f72602be64b17fe30368e82d4e30648781955b2dfbb1e9bab3d5fb90444a2"},
    "18114": {"script":18114,"tickMs":100,"frames":[{"tick":0,"parts":[]},{"tick":1,"parts":[]}],"sounds":[{"tick":1,"sound":18038,"cue":38,"channel":1}],"endCheckTick":2,"sourceSha256":"9ebf0ebf7001b4e47b49c12f49f46f1e571b66253fc0e040abc3781d1af3019e"},
    "18115": {"script":18115,"tickMs":100,"frames":[{"tick":0,"parts":[]}],"sounds":[],"endCheckTick":1,"sourceSha256":"bae150ff570c11117f15151a9e7073aa5dc7ce8302350ee5358a3eb2f572367f"},
    "18116": {"script":18116,"tickMs":100,"frames":[{"tick":0,"parts":[]},{"tick":1,"parts":[]}],"sounds":[{"tick":1,"sound":18037,"cue":37,"channel":1}],"endCheckTick":2,"sourceSha256":"ed5e64209efcbe89e7be04ad8c4c934eea9136f8bcbefc6457104d0445ebcd38"},
    "18117": {"script":18117,"tickMs":100,"frames":[{"tick":0,"parts":[]},{"tick":1,"parts":[]}],"sounds":[{"tick":1,"sound":18038,"cue":38,"channel":1}],"endCheckTick":2,"sourceSha256":"66b1860d75c9da107cefc214615bbe5eff7616b8cc7e6bbf36082ca94a646cb7"},
    "18118": {"script":18118,"tickMs":100,"frames":[{"tick":0,"parts":[]}],"sounds":[],"endCheckTick":1,"sourceSha256":"49c68f79e72db40ccefbf2470f36bbb40f3c8974c99f1da7fac319d590ca809c"},
    "18119": {"script":18119,"tickMs":100,"frames":[{"tick":0,"parts":[]}],"sounds":[],"endCheckTick":1,"sourceSha256":"c1649e4c44b3802f2816593035ad20ccd1c7f9928094b022337cbeb9dcd5d865"},
    "18120": {"script":18120,"tickMs":100,"frames":[{"tick":0,"parts":[]},{"tick":1,"parts":[]}],"sounds":[{"tick":1,"sound":18039,"cue":39,"channel":1}],"endCheckTick":2,"sourceSha256":"a124eee53bedaa888e368c5c7053a207990d59ae989afe7d56f98119b1e19715"},
    "18121": {"script":18121,"tickMs":100,"frames":[{"tick":0,"parts":[]}],"sounds":[],"endCheckTick":1,"sourceSha256":"750c6bcd3b06dd01deaff1bc271c121e85193457831accf171b054a841536035"},
    "18122": {"script":18122,"tickMs":100,"frames":[{"tick":0,"parts":[]}],"sounds":[],"endCheckTick":1,"sourceSha256":"70c97bdb75862238d3a596c3a04a7a71be9342faa15ff3984c133ea3d3af4098"},
    "18123": {"script":18123,"tickMs":100,"frames":[{"tick":0,"parts":[]},{"tick":1,"parts":[]}],"sounds":[{"tick":1,"sound":18039,"cue":39,"channel":1}],"endCheckTick":2,"sourceSha256":"8d6e5737ac94d8d666690d4fcadb0866e09b4ff3fc43f3daec65df51c92355f3"},
    "18124": {"script":18124,"tickMs":100,"frames":[{"tick":0,"parts":[]}],"sounds":[],"endCheckTick":1,"sourceSha256":"30c68942bf12d904a637776255a1613490bb73f636185351f076be3692febd68"},
    "18125": {"script":18125,"tickMs":100,"frames":[{"tick":0,"parts":[]}],"sounds":[],"endCheckTick":1,"sourceSha256":"354d01adba20caba31578d9238811105fabfc41b16505b1244d6ce322e9fea86"},
    "18126": {"script":18126,"tickMs":100,"frames":[{"tick":0,"parts":[]},{"tick":1,"parts":[]}],"sounds":[{"tick":1,"sound":18039,"cue":39,"channel":1}],"endCheckTick":2,"sourceSha256":"3f093d1f6b7096d4e623f52e43dd4542c2544384580408cfd6d22fe69121cf26"},
    "18127": {"script":18127,"tickMs":100,"frames":[{"tick":0,"parts":[]}],"sounds":[],"endCheckTick":1,"sourceSha256":"b41c9ddcf4919b64856b5a87577f9e9d2454c667497b336080a9524c1483fce9"},
    "18185": {"script":18185,"tickMs":100,"frames":[{"tick":0,"parts":[]}],"sounds":[],"endCheckTick":1,"sourceSha256":"fa4ac4b259a6c0fae68f451b4740e49c2cc97297b83f15e06575488b8685271f"},
    "18186": {"script":18186,"tickMs":100,"frames":[{"tick":0,"parts":[]},{"tick":1,"parts":[]}],"sounds":[{"tick":1,"sound":18059,"cue":59,"channel":1}],"endCheckTick":2,"sourceSha256":"f6cb5fb6b9bc111aefdae75fc6c6b328568e20aa5309a5340e4671fbb4688226"},
    "18187": {"script":18187,"tickMs":100,"frames":[{"tick":0,"parts":[]}],"sounds":[],"endCheckTick":1,"sourceSha256":"271d98a197a3e45fbd4fc38d474d2d70ffc52951f73988806f14dd9ff4940256"},
    "18188": {"script":18188,"tickMs":100,"frames":[{"tick":0,"parts":[]}],"sounds":[],"endCheckTick":1,"sourceSha256":"54fa512c39372a96fd98896f33d96f692d2e0ebe182907314d0329ba5aaeb178"},
    "18189": {"script":18189,"tickMs":100,"frames":[{"tick":0,"parts":[]},{"tick":1,"parts":[]}],"sounds":[{"tick":1,"sound":18060,"cue":60,"channel":1}],"endCheckTick":2,"sourceSha256":"27412f5039e87bf49f30607f2faf97ca3bac6191cbde507d9305bed92690426c"},
    "18190": {"script":18190,"tickMs":100,"frames":[{"tick":0,"parts":[]}],"sounds":[],"endCheckTick":1,"sourceSha256":"638e00b910769c37b2d8a12d8aa2d0b0935f0202ed5904f5c3588c5ab1cf40aa"},
    "18191": {"script":18191,"tickMs":100,"frames":[{"tick":0,"parts":[]}],"sounds":[],"endCheckTick":1,"sourceSha256":"c22a00f1d26375582e4145a417da044830acc4d473cfddfab16c39202d6139a9"},
    "18192": {"script":18192,"tickMs":100,"frames":[{"tick":0,"parts":[]},{"tick":1,"parts":[]}],"sounds":[{"tick":1,"sound":18071,"cue":71,"channel":1}],"endCheckTick":2,"sourceSha256":"cb2fd492470d7391d61d2c315609ff630e1bbb6a0f7db3370ab1358e28d325c3"},
    "18193": {"script":18193,"tickMs":100,"frames":[{"tick":0,"parts":[]}],"sounds":[],"endCheckTick":1,"sourceSha256":"2fb12d75156bdb9b76866f095e9b4d4c70f2f427854890cfa3e1bdee86100248"},
    "18194": {"script":18194,"tickMs":100,"frames":[{"tick":0,"parts":[]}],"sounds":[],"endCheckTick":1,"sourceSha256":"c22a00f1d26375582e4145a417da044830acc4d473cfddfab16c39202d6139a9"},
    "18195": {"script":18195,"tickMs":100,"frames":[{"tick":0,"parts":[]},{"tick":1,"parts":[]}],"sounds":[{"tick":1,"sound":18071,"cue":71,"channel":1}],"endCheckTick":2,"sourceSha256":"cb2fd492470d7391d61d2c315609ff630e1bbb6a0f7db3370ab1358e28d325c3"},
    "18196": {"script":18196,"tickMs":100,"frames":[{"tick":0,"parts":[]}],"sounds":[],"endCheckTick":1,"sourceSha256":"2fb12d75156bdb9b76866f095e9b4d4c70f2f427854890cfa3e1bdee86100248"},
    "18226": {"script":18226,"tickMs":100,"frames":[{"tick":0,"parts":[]}],"sounds":[],"endCheckTick":1,"sourceSha256":"0bd8bb256e6b65f6b8ae78fe43dcb7fce63e40bd3edb9dec80b3cd6541da5276"},
    "18227": {"script":18227,"tickMs":100,"frames":[{"tick":0,"parts":[]},{"tick":1,"parts":[]}],"sounds":[{"tick":1,"sound":18062,"cue":62,"channel":1}],"endCheckTick":2,"sourceSha256":"bf8d169990ea4436be4fb2250dbb36070b2acf80635631977d0a2b061f5297b7"},
    "18228": {"script":18228,"tickMs":100,"frames":[{"tick":0,"parts":[]}],"sounds":[],"endCheckTick":1,"sourceSha256":"47ed2697918a09e922ea6e62b701336c9d0f6d649879a985fe7883af843d7eed"},
    "18229": {"script":18229,"tickMs":100,"frames":[{"tick":0,"parts":[]}],"sounds":[],"endCheckTick":1,"sourceSha256":"968cf408508f3c9604538b49d5fca637be960ed84803c1d3427212f11e167c8c"},
    "18230": {"script":18230,"tickMs":100,"frames":[{"tick":0,"parts":[]},{"tick":1,"parts":[]}],"sounds":[{"tick":1,"sound":18063,"cue":63,"channel":1}],"endCheckTick":2,"sourceSha256":"95a2ec2ecd5bd7949b102314f44d9fe61b8252b65a587750ad4bf23d4b7f131c"},
    "18231": {"script":18231,"tickMs":100,"frames":[{"tick":0,"parts":[]}],"sounds":[],"endCheckTick":1,"sourceSha256":"1a8a0af8ad441b440e44228658ce6d2968e2356150c0ad761cc45ee402abe403"},
    "18232": {"script":18232,"tickMs":100,"frames":[{"tick":0,"parts":[]}],"sounds":[],"endCheckTick":1,"sourceSha256":"3c0fcc35c6ad57ab732eadf23f0e0d5c7b88ce11c385f373c63bc7cdabbdad1a"},
    "18233": {"script":18233,"tickMs":100,"frames":[{"tick":0,"parts":[]},{"tick":1,"parts":[]}],"sounds":[{"tick":1,"sound":18064,"cue":64,"channel":1}],"endCheckTick":2,"sourceSha256":"86bc96fb57d17d73260866156b2007f2096996ce00ac9749a1a2c4afcaf206c0"},
    "18234": {"script":18234,"tickMs":100,"frames":[{"tick":0,"parts":[]}],"sounds":[],"endCheckTick":1,"sourceSha256":"8886c58ade18cf84fbeb4b69c32ba75226dccf68576306450cc64dbaac89a435"},
    "18235": {"script":18235,"tickMs":100,"frames":[{"tick":0,"parts":[]}],"sounds":[],"endCheckTick":1,"sourceSha256":"4e17c9136394716beb8a7e4c0690fe3b6735c9dc16dcb3bcc0b99fd772fabfa0"},
    "18236": {"script":18236,"tickMs":100,"frames":[{"tick":0,"parts":[]},{"tick":1,"parts":[]}],"sounds":[{"tick":1,"sound":18065,"cue":65,"channel":1}],"endCheckTick":2,"sourceSha256":"3095feb68590bda31d3413d64ea8656e1cd89e583db36a550fd6ecea2154e87d"},
    "18237": {"script":18237,"tickMs":100,"frames":[{"tick":0,"parts":[]}],"sounds":[],"endCheckTick":1,"sourceSha256":"f036090fee84384c298305f4be85b6cfdf931ded74cbbb1f5ea9b75b96cef553"},
    "18238": {"script":18238,"tickMs":100,"frames":[{"tick":0,"parts":[]}],"sounds":[],"endCheckTick":1,"sourceSha256":"3c0c8eff139e2e716daf061b2951e488be239ddd4aace909fb95a7d5d21d6bb7"},
    "18239": {"script":18239,"tickMs":100,"frames":[{"tick":0,"parts":[]},{"tick":1,"parts":[]}],"sounds":[{"tick":1,"sound":18066,"cue":66,"channel":1}],"endCheckTick":2,"sourceSha256":"19e517d1ec95691d68b677380102b8568758884b488f3d31307779e55403ed46"},
    "18240": {"script":18240,"tickMs":100,"frames":[{"tick":0,"parts":[]}],"sounds":[],"endCheckTick":1,"sourceSha256":"427f63fdbe9c2b0dd7c7a93d600feadf3ef24afae1c8295f1ae7251d16b68c88"},
    "18241": {"script":18241,"tickMs":100,"frames":[{"tick":0,"parts":[]}],"sounds":[],"endCheckTick":1,"sourceSha256":"4b6eab1e941d29da85abdfec32a4929eea367d4624c08457b27f32f9b3642621"},
    "18242": {"script":18242,"tickMs":100,"frames":[{"tick":0,"parts":[]}],"sounds":[],"endCheckTick":1,"sourceSha256":"2fe20ef69da4e1fd4c9bb76ee642c3478d6b8b7099f4e639e02dff798d051fd9"},
    "18243": {"script":18243,"tickMs":100,"frames":[{"tick":0,"parts":[]},{"tick":1,"parts":[]}],"sounds":[{"tick":1,"sound":18067,"cue":67,"channel":1}],"endCheckTick":2,"sourceSha256":"1c9bea866295fec8af8ce2f0f3ffd87621cf38fc56fd07f4d491dcbc554d7f2c"},
    "18244": {"script":18244,"tickMs":100,"frames":[{"tick":0,"parts":[]}],"sounds":[],"endCheckTick":1,"sourceSha256":"a371e532e9d38da8d11dfabf29d69bac32bfa4790e58231eccb7ceacfb7b883e"},
    "18245": {"script":18245,"tickMs":100,"frames":[{"tick":0,"parts":[]}],"sounds":[],"endCheckTick":1,"sourceSha256":"a537bb2917483d54dbf20fe2664f2eadf68f48f671ddb434843af35bf5692a41"},
    "18246": {"script":18246,"tickMs":100,"frames":[{"tick":0,"parts":[]},{"tick":1,"parts":[]}],"sounds":[{"tick":1,"sound":18067,"cue":67,"channel":1}],"endCheckTick":2,"sourceSha256":"b4440a7215ef62d0c6e33a31af510939c3a50cdf2747c8207021727c833b7f31"},
    "18247": {"script":18247,"tickMs":100,"frames":[{"tick":0,"parts":[]}],"sounds":[],"endCheckTick":1,"sourceSha256":"296f94eb8783d2fa1bfabd852d00a8d0b11e51299f1f88a6329aaff6906aeb91"},
    "18278": {"script":18278,"tickMs":100,"frames":[{"tick":0,"parts":[]}],"sounds":[],"endCheckTick":1,"sourceSha256":"2a7a3243dd1a2f6555ccdad0d587ce16473bab4a49751f62a09941bea8b1ff78"},
    "18279": {"script":18279,"tickMs":100,"frames":[{"tick":0,"parts":[]}],"sounds":[],"endCheckTick":1,"sourceSha256":"b9127d67fd35477d345fe851dd4a1396836cf00bcd7a6ffaee404e6b86bdceb8"},
    "18280": {"script":18280,"tickMs":100,"frames":[{"tick":0,"parts":[]}],"sounds":[],"endCheckTick":1,"sourceSha256":"7c915a2391d3a68f4603a95ae7ba6d9afb72aca67691fa672e0d1592eef871cf"},
    "18281": {"script":18281,"tickMs":100,"frames":[{"tick":0,"parts":[]}],"sounds":[],"endCheckTick":1,"sourceSha256":"3e8b4e0d1a8baf254111e7b7e70c969c8463bc50779300d54fc00e9173b9f4bc"},
    "18282": {"script":18282,"tickMs":100,"frames":[{"tick":0,"parts":[]}],"sounds":[],"endCheckTick":1,"sourceSha256":"e31a2c2d1933e2efb062edfb68faed8135502c46c2c1fc0af30cb73eb87d2d6d"},
    "18283": {"script":18283,"tickMs":100,"frames":[{"tick":0,"parts":[]}],"sounds":[],"endCheckTick":1,"sourceSha256":"ca2f37bbe9a930266bdea1419c241707c837d40b2f31441a65bdaa821f6de554"},
    "18284": {"script":18284,"tickMs":100,"frames":[{"tick":0,"parts":[]}],"sounds":[],"endCheckTick":1,"sourceSha256":"0ae248b848c4347b7b4834e9e3ab33c2444663337f4d73ee9f299200d6add02e"},
    "18285": {"script":18285,"tickMs":100,"frames":[{"tick":0,"parts":[]}],"sounds":[],"endCheckTick":1,"sourceSha256":"9f998ff0807c94e6dfea650aafffe64723a6305986fbc5d4c6692b691c797941"},
    "18307": {"script":18307,"tickMs":100,"frames":[{"tick":0,"parts":[]}],"sounds":[],"endCheckTick":1,"sourceSha256":"49efd85e0bb36f944015e435781a4186eb8cc6a7ab9ae1f6566fad2332022ad8"},
    "18308": {"script":18308,"tickMs":100,"frames":[{"tick":0,"parts":[]}],"sounds":[],"endCheckTick":1,"sourceSha256":"d699bae40cb156934afbb9c8776d23efc28c675b7ae4e53b7b375c92ed5413d4"},
    "18309": {"script":18309,"tickMs":100,"frames":[{"tick":0,"parts":[]}],"sounds":[],"endCheckTick":1,"sourceSha256":"73b9ae9eabeb718cc0c3a1ff8c88342b806015d2bcfc3561ab01e8bd8eae66e3"},
    "18310": {"script":18310,"tickMs":100,"frames":[{"tick":0,"parts":[]}],"sounds":[],"endCheckTick":1,"sourceSha256":"e3bebe0c924f206cd0ca3c487964088f18aac4635dfd64eb26c3d5dd70f58504"},
    "18311": {"script":18311,"tickMs":100,"frames":[{"tick":0,"parts":[]}],"sounds":[],"endCheckTick":1,"sourceSha256":"0804cd99d45da71c6c362e8aca9309a34753e70182dce341dc99cb98407ea7e5"},
    "18312": {"script":18312,"tickMs":100,"frames":[{"tick":0,"parts":[]}],"sounds":[],"endCheckTick":1,"sourceSha256":"8c57775fdae27ec91a74d5688e0b31c0bb59ebd3e934b876a3050e75308948f6"},
    "18313": {"script":18313,"tickMs":100,"frames":[{"tick":0,"parts":[]}],"sounds":[],"endCheckTick":1,"sourceSha256":"594a84928362c5badf652b72618ad83815e9634227b6ec7965f19658906bf51e"},
    "18314": {"script":18314,"tickMs":100,"frames":[{"tick":0,"parts":[]}],"sounds":[],"endCheckTick":1,"sourceSha256":"50c0252ed8af91b47df45c2e07478a214f2951a7d2efcc32b9697cf528a08b04"},
    "18358": {"script":18358,"tickMs":100,"frames":[{"tick":0,"parts":[]}],"sounds":[],"endCheckTick":1,"sourceSha256":"9843f31b9887b8b9349931b03886a7f2e4824c61f86e7d0f8f90f36a8796e711"},
    "18359": {"script":18359,"tickMs":100,"frames":[{"tick":0,"parts":[]},{"tick":1,"parts":[]}],"sounds":[{"tick":1,"sound":18072,"cue":72,"channel":1}],"endCheckTick":2,"sourceSha256":"1695ae20e2903f6e81b6aaab5483c7751beb71e32ceb520aa3ef88cb4789dff1"},
    "18360": {"script":18360,"tickMs":100,"frames":[{"tick":0,"parts":[]}],"sounds":[],"endCheckTick":1,"sourceSha256":"db383ab3cadce3ca6e321c826d651a28c4b5a4ef3828930a726afb0dc407976e"},
    "18361": {"script":18361,"tickMs":100,"frames":[{"tick":0,"parts":[]}],"sounds":[],"endCheckTick":1,"sourceSha256":"e16ffe874a471cd363af4182af86e1899050d5dcad39fdf42c161ae5874e3cf6"},
    "18362": {"script":18362,"tickMs":100,"frames":[{"tick":0,"parts":[]},{"tick":1,"parts":[]}],"sounds":[{"tick":1,"sound":18072,"cue":72,"channel":1}],"endCheckTick":2,"sourceSha256":"1fcf874c3bfd4c5115d3c2ff49a8dc805b5dffdfea579e3f0a78e7c02822ae68"},
    "18363": {"script":18363,"tickMs":100,"frames":[{"tick":0,"parts":[]}],"sounds":[],"endCheckTick":1,"sourceSha256":"d7e8a136680c488e9681a5259549d77491f8372e6c5fe66076eb1625ab0e0d43"},
    "18364": {"script":18364,"tickMs":100,"frames":[{"tick":0,"parts":[]}],"sounds":[],"endCheckTick":1,"sourceSha256":"81d5cca5ab3ec67de55bdb578e17d69fbaa70442e537ef2f82ee7d7d56466ff6"},
    "18365": {"script":18365,"tickMs":100,"frames":[{"tick":0,"parts":[]},{"tick":1,"parts":[]}],"sounds":[{"tick":1,"sound":18072,"cue":72,"channel":1}],"endCheckTick":2,"sourceSha256":"f891d9cf83c56817cad974f746008e4eb45bcaeccdeac1be508f96252fc773c2"},
    "18366": {"script":18366,"tickMs":100,"frames":[{"tick":0,"parts":[]}],"sounds":[],"endCheckTick":1,"sourceSha256":"41e9d57f8c778145e3e9712c6fd7ae05592b3cd234abe7daa0b3fb4c354abfe1"},
    "18367": {"script":18367,"tickMs":100,"frames":[{"tick":0,"parts":[]}],"sounds":[],"endCheckTick":1,"sourceSha256":"547ef08eee39bee29ce263d63408943a0d36f153ba8038f1a34840ffeb62cf66"},
    "18368": {"script":18368,"tickMs":100,"frames":[{"tick":0,"parts":[]},{"tick":1,"parts":[]}],"sounds":[{"tick":1,"sound":18072,"cue":72,"channel":1}],"endCheckTick":2,"sourceSha256":"0dae6e4875590d31da62ad0cbc6ac056a27bd05a879ad904db4e89e113f2287b"},
    "18369": {"script":18369,"tickMs":100,"frames":[{"tick":0,"parts":[]}],"sounds":[],"endCheckTick":1,"sourceSha256":"42563ba382538f35c20298deabd301d37e049557aa8b2484b30d84a310900938"},
    "18370": {"script":18370,"tickMs":100,"frames":[{"tick":0,"parts":[]}],"sounds":[],"endCheckTick":1,"sourceSha256":"e77a410664558616b82ef328f95551731b80f4c96de402ca5b309849afd092e9"},
    "18371": {"script":18371,"tickMs":100,"frames":[{"tick":0,"parts":[]},{"tick":1,"parts":[]}],"sounds":[{"tick":1,"sound":18072,"cue":72,"channel":1}],"endCheckTick":2,"sourceSha256":"84ff54308fa6c73c1fff9916388469750ffb5cbe81ad557bc53cfe9a14de390e"},
    "18372": {"script":18372,"tickMs":100,"frames":[{"tick":0,"parts":[]}],"sounds":[],"endCheckTick":1,"sourceSha256":"65837b7d9ac5524b1b62224cd942d88154706bc8c0424dd49301882b74749932"},
    "18373": {"script":18373,"tickMs":100,"frames":[{"tick":0,"parts":[]}],"sounds":[],"endCheckTick":1,"sourceSha256":"6c6cb07671e74d69235988a52b4d4352a7b676c1f7f8552186a44aa8fea55ac5"},
    "18374": {"script":18374,"tickMs":100,"frames":[{"tick":0,"parts":[]},{"tick":1,"parts":[]}],"sounds":[{"tick":1,"sound":18072,"cue":72,"channel":1}],"endCheckTick":2,"sourceSha256":"326d660d22742ef467453e6637984d971b80ef5bff0aababc596703ba180e18e"},
    "18375": {"script":18375,"tickMs":100,"frames":[{"tick":0,"parts":[]}],"sounds":[],"endCheckTick":1,"sourceSha256":"b68c36d48e9c80ea0701ee1ec759b1cc77326f40ce766d0670a8c6a14258df21"},
    "18377": {"script":18377,"tickMs":100,"frames":[{"tick":0,"parts":[]}],"sounds":[],"endCheckTick":1,"sourceSha256":"65b397beea8a34f92aa17f9628bdb026a959156a0fa3be7707427c0aa7a9e876"},
    "18378": {"script":18378,"tickMs":100,"frames":[{"tick":0,"parts":[]},{"tick":1,"parts":[]}],"sounds":[{"tick":1,"sound":18066,"cue":66,"channel":1}],"endCheckTick":2,"sourceSha256":"26ea7f11f8296e5993d34dd00cd4c20af763ca04a4dfcbb00aa013be67808789"},
    "18379": {"script":18379,"tickMs":100,"frames":[{"tick":0,"parts":[]}],"sounds":[],"endCheckTick":1,"sourceSha256":"56757c104d4e07a28d21b8e6a20535170b86bc5c0b6dbc10d03dd247cf4eca19"}
  },
  sounds: {"18003":{"src":"secondary-motion/sounds/18003.wav","sourceSha256":"f5faba93126e2becf0184b5677732f114d075a41ce0fb6f9ccb526dee60a67cd","sampleRate":22050,"channels":1,"sampleFrames":1780,"sha256":"e78ecec97f0051ef24e0ec4c6e8f491b0c3834f62c7806057e3416563edd9771"},"18037":{"src":"secondary-motion/sounds/18037.wav","sourceSha256":"b21e8cf4fc0dfce6bad7de1647c8c6a3e573ba835d02718b9e5b37b6841a84cf","sampleRate":22050,"channels":1,"sampleFrames":1138,"sha256":"dc415abb6a8f2a7bc338e53de71583c6fe8a4d5cbd75e3e1e6ca55ca46f01006"},"18038":{"src":"secondary-motion/sounds/18038.wav","sourceSha256":"938cab4da5ce2dcbfabaf5d886eddc089fd0de2459119fc46b19091f7cbc686f","sampleRate":22050,"channels":1,"sampleFrames":1349,"sha256":"6903e5288d02c9186e01b7c5d68dfa95938e9b515a9861b305bfa2b4be14e0b6"},"18039":{"src":"secondary-motion/sounds/18039.wav","sourceSha256":"6ea55ebe4ccecdf1059ef5d5573d27d5b0ace3dc8f9e2a1d4bcf6e2d2a81b1ba","sampleRate":22050,"channels":1,"sampleFrames":2751,"sha256":"ee394ab399afaaf9943a527c2ddbfa4270cae880795794edcf3089b04f913e8d"},"18052":{"src":"secondary-motion/sounds/18052.wav","sourceSha256":"8e7483f245b3146916f49d5947ce520e82fa64a93fb2d511f25e810ad87605f3","sampleRate":22050,"channels":1,"sampleFrames":1430,"sha256":"348b8db7e0f98a0218c6887c1a80ffbf6497936a009b62b49e8653fbec877eb4"},"18053":{"src":"secondary-motion/sounds/18053.wav","sourceSha256":"65895b2cc0e36deedc4fb16b3ff3d103ed2755e218ee58ee047b6d5b4665d325","sampleRate":22050,"channels":1,"sampleFrames":1209,"sha256":"58599701e19d873aeda3abff970560447fe6b108d49bf3215f5e4bb601d4ee5d"},"18054":{"src":"secondary-motion/sounds/18054.wav","sourceSha256":"366175678df98675b58516c3319fe02cbba13deb9390f8c47126c9293c044711","sampleRate":22050,"channels":1,"sampleFrames":1467,"sha256":"0a7c4ba6fcea58dc6b6ca6043acecdf6cdb83068f7ebe1e23f0cfd5b2d68ecfa"},"18055":{"src":"secondary-motion/sounds/18055.wav","sourceSha256":"8e7483f245b3146916f49d5947ce520e82fa64a93fb2d511f25e810ad87605f3","sampleRate":22050,"channels":1,"sampleFrames":1430,"sha256":"348b8db7e0f98a0218c6887c1a80ffbf6497936a009b62b49e8653fbec877eb4"},"18056":{"src":"secondary-motion/sounds/18056.wav","sourceSha256":"65895b2cc0e36deedc4fb16b3ff3d103ed2755e218ee58ee047b6d5b4665d325","sampleRate":22050,"channels":1,"sampleFrames":1209,"sha256":"58599701e19d873aeda3abff970560447fe6b108d49bf3215f5e4bb601d4ee5d"},"18057":{"src":"secondary-motion/sounds/18057.wav","sourceSha256":"83fa118ce645158139f1260176fc9011ccdfa965dc92368d4038f1ae8e1bd0eb","sampleRate":22050,"channels":1,"sampleFrames":1768,"sha256":"771261f78ebb536af0d20642bbb22d9d215013dd6e89c94d61ce76772f8ed8b1"},"18058":{"src":"secondary-motion/sounds/18058.wav","sourceSha256":"448c5e979344089ca2e3fe6c4ab8e822336aa441572c8fc7453e5c1686916acd","sampleRate":22050,"channels":1,"sampleFrames":3049,"sha256":"55bde84abef5cb205135c8ee285f91e29bdde9488055b54e365f8227f200b8be"},"18059":{"src":"secondary-motion/sounds/18059.wav","sourceSha256":"27ad4c57afebcba08afc8c59db8bfd7e2ba7c39ab32b6798910799e8e76cd0c0","sampleRate":22050,"channels":1,"sampleFrames":9563,"sha256":"562d90218cf174715420e39947653423a6aa53e5f15f897d834635c4a94dd075"},"18060":{"src":"secondary-motion/sounds/18060.wav","sourceSha256":"67e37eccedbf2d0c244f421b7940e527197150745af81fea828cd5823fecc12b","sampleRate":22050,"channels":1,"sampleFrames":16493,"sha256":"8f82647d0187599f2d78f5037618f31465263224548fbf6b1c942002e0f3bc98"},"18061":{"src":"secondary-motion/sounds/18061.wav","sourceSha256":"aabafc1cb3af6f46b22994f7acb5e8e2d549179a4b455fb915c9ea5c0e93e270","sampleRate":22050,"channels":1,"sampleFrames":2716,"sha256":"3c7413c3f40bd0f61972f7dd2ac7d4d225c361b971375e258df2d4471e8d8cd2"},"18062":{"src":"secondary-motion/sounds/18062.wav","sourceSha256":"6307f94939a29c56ca13b7810707c34de9c44f9b577f36751881b4a23565f87f","sampleRate":22050,"channels":1,"sampleFrames":1349,"sha256":"bead094cb69d1f169693237867b9074391e2fbf471cfc56d9da3f793d318f4df"},"18063":{"src":"secondary-motion/sounds/18063.wav","sourceSha256":"938cab4da5ce2dcbfabaf5d886eddc089fd0de2459119fc46b19091f7cbc686f","sampleRate":22050,"channels":1,"sampleFrames":1349,"sha256":"6903e5288d02c9186e01b7c5d68dfa95938e9b515a9861b305bfa2b4be14e0b6"},"18064":{"src":"secondary-motion/sounds/18064.wav","sourceSha256":"e0f46d00032512f20544cb1430568c2e332b91b33976bf3f8ba6c52b4c49e855","sampleRate":22050,"channels":1,"sampleFrames":1349,"sha256":"5141cbfb7c4b3ec5bc80160874d4a6198e6a3973355a963fd00ac55d1c13c9d6"},"18065":{"src":"secondary-motion/sounds/18065.wav","sourceSha256":"a8edb9768e5773e80faaeb5a6b6877509f8dd0c8b50354d7ed2b7cd48e317971","sampleRate":22050,"channels":1,"sampleFrames":1345,"sha256":"fd04f779a30c55898938506b8e20c8f90b739f88dac9716e4679c5913e6ca009"},"18066":{"src":"secondary-motion/sounds/18066.wav","sourceSha256":"b21e8cf4fc0dfce6bad7de1647c8c6a3e573ba835d02718b9e5b37b6841a84cf","sampleRate":22050,"channels":1,"sampleFrames":1138,"sha256":"dc415abb6a8f2a7bc338e53de71583c6fe8a4d5cbd75e3e1e6ca55ca46f01006"},"18067":{"src":"secondary-motion/sounds/18067.wav","sourceSha256":"f5faba93126e2becf0184b5677732f114d075a41ce0fb6f9ccb526dee60a67cd","sampleRate":22050,"channels":1,"sampleFrames":1780,"sha256":"e78ecec97f0051ef24e0ec4c6e8f491b0c3834f62c7806057e3416563edd9771"},"18071":{"src":"secondary-motion/sounds/18071.wav","sourceSha256":"1ebe32b1902a71da827891db969e833fd893d5212cfd233f9d400861518aa08a","sampleRate":44100,"channels":2,"sampleFrames":14772,"sha256":"f9276e087ae98d284f083a2dd417180dc79645cbad83a963bf1bb4fa38476bae"},"18072":{"src":"secondary-motion/sounds/18072.wav","sourceSha256":"d26721bfcf80bb49ecf9ad3a609031d72bf49ca11814cc3347958bf46f6ae636","sampleRate":22050,"channels":1,"sampleFrames":1661,"sha256":"e39ae77f7a95293618054d8c1af3db73d81bf20bbefd608e85dc2c252635e9d2"}}
};
const row = (table, index) => ({ ...data.buttons.find(b => b.table === table && b.index === index), policy: policyFor(table, index) });
const build = (buttons, options = {}) => createActionStateController({ ...data, buttons }, { now: () => 0, ...options });
const state = c => c.snapshot().map(s => s.state);

test('null replacement clears a stopped channel completion gate', () => {
  const stops = [];
  const clip = { script: 1, tickMs: 10, endCheckTick: 3,
    frames: [{ tick: 0, parts: [] }, { tick: 2, parts: [] }],
    sounds: [{ tick: 0, sound: 1, channel: 1 }, { tick: 1, sound: 2, channel: 1 }] };
  const c = createActionStateController({ buttons: [{ ...row(18700, 3), stateScripts: [1, 1, 0, 0] }], scripts: { 1: clip } },
    { now: () => 0, playSound: cue => cue.sound === 1 ? { stop: () => stops.push(1), isComplete: () => false } : null });
  c.step(10); c.step(20); c.step(30);
  assert.deepEqual(stops, [1]);
  assert.equal(c.snapshot()[0].finished, true);
});

test('disable cancels held toggle pending cues without silencing a peer', () => {
  const plays = [];
  const c = build([row(9383, 9), row(9383, 10)], {
    authoritative: [{ active: true }, { active: false }],
    playSound: cue => { plays.push(cue.sound); return { stop() {}, isComplete: () => true }; },
  });
  c.press(0); c.setDisabled(0, true, 10);
  assert.equal(c.release(true), null);
  assert.equal(c.snapshot()[0].state, 2);
  c.press(1); c.step(100);
  assert.equal(plays.length, 1);
  assert.equal(plays[0], data.scripts[row(9383, 10).stateScripts[1]].sounds[0].sound);
});

test('all 36 source rows have explicit compatible policies; unavailable actions stay unavailable', () => {
  const buttons = data.buttons.map(b => row(b.table, b.index));
  const c = build(buttons);
  assert.equal(buttons.length, 36);
  buttons.forEach((b, index) => {
    if (!b.policy.binding) { assert.equal(c.press(index), false); assert.equal(c.snapshot()[index].disabled, true); }
  });
  assert.throws(() => policyFor(9383, 99), /Unreviewed/);
  assert.equal(row(9383, 15).policy.binding, null);
  assert.equal(row(926, 11).policy.binding, null);
});

test('optional source fixture matches portable authored timeline pins', { skip: !fs.existsSync('public/original/ui/secondary-motion/manifest.json') }, () => {
  const source = JSON.parse(fs.readFileSync('public/original/ui/secondary-motion/manifest.json'));
  for (const [id, clip] of Object.entries(data.scripts)) {
    assert.equal(clip.sourceSha256, source.scripts[id].sourceSha256);
    assert.deepEqual(clip.frames.map(f => f.tick), source.scripts[id].frames.map(f => f.tick));
    assert.deepEqual(clip.sounds, source.scripts[id].sounds);
    assert.equal(clip.endCheckTick, source.scripts[id].endCheckTick);
  }
});

test('momentary accepts once on inside release, outside and cancellation emit nothing', () => {
  const trace = [], c = build([row(18700, 3)], { onDispatch: e => trace.push(e.event) });
  assert.equal(c.press(0), true); assert.equal(c.press(0), false);
  c.leave(0); c.enter(0);
  assert.equal(c.release(true).binding, 'stamp-edit'); assert.deepEqual(state(c), [0]);
  assert.equal(c.release(true), null);
  assert.deepEqual(trace, [0x2005, 0x2001, 0x2000, 0x2002]);
  c.press(0); c.leave(0); assert.equal(c.release(false), null);
  c.press(0); c.cancel(); assert.equal(c.release(true), null); assert.deepEqual(state(c), [0]);
});

test('independent B/I/U toggles, on tracking outside restores latch and authoritative value', () => {
  const c = build([9, 10, 11].map(i => row(9383, i)));
  for (let i = 0; i < 3; i++) { c.press(i); assert.equal(c.release(true).state, 2); c.setAuthoritativeState(i, { active: true }); }
  assert.deepEqual(state(c), [2, 2, 2]);
  c.press(1); c.release(true); c.setAuthoritativeState(1, { active: false });
  assert.deepEqual(state(c), [2, 0, 2]);
  c.press(0); c.leave(0); c.release(false); assert.deepEqual(state(c), [2, 0, 2]);
  c.press(0); c.cancel(); assert.deepEqual(state(c), [2, 0, 2]);
  assert.equal(c.snapshot()[0].disabled, false);
});

test('exclusive alignment source row order and same-script 1→3/1→2 progress', () => {
  const c = build([6, 7, 8].map(i => row(9383, i)));
  c.press(1); c.step(100); assert.equal(c.snapshot()[1].tick, 1);
  assert.equal(c.release(true, 100).binding, 'align:right');
  assert.equal(c.snapshot()[1].tick, 1); assert.deepEqual(state(c), [0, 3, 0]);
  assert.equal(c.press(1), false);
  c.press(2); c.release(true); assert.deepEqual(state(c), [0, 0, 3]);
  const toggle = build([row(9383, 9)]);
  toggle.press(0); toggle.step(100); toggle.release(true, 100);
  assert.equal(toggle.snapshot()[0].tick, 1);
  toggle.setAuthoritativeState(0, { active: true }, 100); assert.equal(toggle.snapshot()[0].tick, 1);
});

test('Stamp boundary slot3 mutates while constructed mode stays2; both ends may disable', () => {
  const messages = [], c = build([row(18700, 1), row(18700, 2)], { onGroupMessage: e => messages.push(e) });
  c.dispatch(0, 0x2007); assert.deepEqual(state(c), [0, 0]); // owner cleared slot3
  c.setAuthoritativeState(0, { boundary: true }); c.setAuthoritativeState(1, { boundary: true });
  assert.deepEqual(state(c), [3, 3]); assert.equal(c.press(0), false);
  assert.equal(c.snapshot()[0].script, 18307); assert.equal(c.snapshot()[1].script, 18308);
  c.setAuthoritativeState(0, { boundary: false }); assert.equal(c.snapshot()[0].mode, 2);
  c.press(0); c.step(100); c.release(true, 100); assert.deepEqual(state(c), [0, 3]);
  assert.equal(messages.length, 0);
  c.setAuthoritativeState(0, { boundary: true }, 100);
  assert.equal(c.snapshot()[0].tick, 0); // different program swaps/restarts
  c.dispatch(0, 0x2004); assert.equal(c.snapshot()[0].inputEnabled, true);
});

test('input disabled is independent of artwork and cancels held action', () => {
  const c = build([row(926, 2)]);
  c.press(0); c.setDisabled(0, true); assert.equal(c.release(true), null);
  assert.deepEqual(state(c), [0]); assert.equal(c.press(0), false);
  c.setDisabled(0, false); assert.equal(c.press(0), true);
});

test('dispatch jump-table branches, latch, group notifications and slot3 exit epilogue', () => {
  const trace = [], messages = [], c = build([row(9383, 9)], {
    onDispatch: e => trace.push([e.event, e.state, e.latch]), onGroupMessage: e => messages.push(e.message),
  });
  for (const e of [0x2000, 0x2001, 0x2002, 0x2005, 0x2003, 0x2006, 0x2002, 0x2004, 0x2007, 0x2008]) c.dispatch(0, e);
  assert.deepEqual(trace.map(e => e.slice(1)), [[1,0],[0,0],[2,1],[1,1],[2,1],[2,1],[0,0],[0,0],[0,0],[0,0]]);
  assert.deepEqual(messages, [0x65, 0x65]);
  const select = build([row(9383, 6)]);
  select.dispatch(0, 0x2007); select.dispatch(0, 0x2001);
  assert.equal(select.snapshot()[0].inputEnabled, true);
  assert.throws(() => select.dispatch(0, 0x2009), /Unsupported/);
});

test('mode2 overlap traces match existing controller for source selector slots', () => {
  const buttons = [6, 7, 8].map(i => ({ ...row(9383, i), mode: 2 }));
  const c = build(buttons), old = createMode2MotionController({ ...data, buttons }, { now: () => 0 });
  const compare = () => assert.deepEqual(c.snapshot().map(({ state, script, tick, finished, auxiliary }) => ({ state, script, tick, finished, auxiliary })),
    old.snapshot().map(({ state, script, tick, finished, auxiliary }) => ({ state, script, tick, finished, auxiliary })));
  for (const [method, args] of [['enter',[0,0]], ['step',[100]], ['leave',[0,100]], ['press',[1,100]],
    ['step',[200]], ['release',[true,200]], ['step',[300]], ['press',[2,300]], ['release',[true,300]]]) {
    c[method](...args); old[method](...args); compare();
  }
});

test('actual sound end gate holds final pose; late delivery advances once; missing audio finishes', () => {
  let complete = false, stopped = 0;
  const c = build([row(9383, 9)], { playSound: () => ({ stop() { stopped++; }, isComplete: () => complete }) });
  c.press(0); c.step(10000); assert.equal(c.snapshot()[0].tick, 1);
  c.release(true, 10000); c.step(10100); assert.equal(c.snapshot()[0].finished, false);
  complete = true; c.step(10200); assert.equal(c.snapshot()[0].finished, true);
  assert.equal(c.snapshot()[0].tick, 1); c.cancel(); assert.ok(stopped > 0);
  const silent = build([row(9383, 9)]); silent.press(0); silent.step(100); silent.step(200);
  assert.equal(silent.snapshot()[0].finished, true);
});

test('Grab configured single-pose hover loops restart until leave; otheraux finite', () => {
  const c = build([row(926, 2)]); c.enter(0);
  for (let t = 100; t <= 1000; t += 100) { c.step(t); assert.equal(c.snapshot()[0].auxiliary, true); assert.equal(c.snapshot()[0].tick, 0); }
  c.leave(0); c.step(1100); assert.equal(c.snapshot()[0].auxiliary, false);
  const finite = build([row(18700, 3)]); finite.enter(0); finite.step(100);
  assert.equal(finite.snapshot()[0].auxiliary, false);
});

// Pure fixture only for audio channels/replacement not present in all real clips.
test('owned auxiliary audio stops on leave/cancel/dispose; channels1/2 alone gate ending', () => {
  const b = row(926, 2), stops = [], plays = [];
  const clip = { script: 1, tickMs: 10, endCheckTick: 1, frames: [{ tick: 0, parts: [] }],
    sounds: [{ tick: 0, sound: 1, channel: 3 }] };
  const c = createActionStateController({ buttons: [{ ...b, stateScripts: [1,1,0,0], rolloverScript: 1 }], scripts: { 1: clip } },
    { now: () => 0, playSound: (_, owner) => { plays.push(owner); return { stop: () => stops.push(owner), isComplete: () => false }; } });
  c.enter(0); c.step(10); assert.equal(c.snapshot()[0].auxiliary, true);
  assert.equal(new Set(plays).size, plays.length);
  c.leave(0); c.cancel(); c.dispose(); c.step(20);
  assert.deepEqual(new Set(stops), new Set(plays)); assert.equal(c.press(0), false);
});

test('cancel restores latest authoritative browser state without pending or restart audio', () => {
  let plays = 0;
  const c = build([row(9383, 9)], { playSound: () => { plays++; return { stop() {}, isComplete: () => true }; } });
  c.press(0); c.setAuthoritativeState(0, { active: true }); // held rerender retains tracking
  assert.deepEqual(state(c), [1]); c.cancel(); assert.deepEqual(state(c), [2]);
  c.step(100); c.step(200); assert.equal(plays, 0);
  c.press(0); c.step(300); c.release(true, 300); // next genuine input can sound
  assert.equal(c.snapshot()[0].state, 0);
});

test('same script rerenders preserve deadlines; different controller audio ownership is unique', () => {
  const owners = [];
  const opts = { playSound: (_, owner) => { owners.push(owner); return null; } };
  const a = build([row(9383, 9)], opts), b = build([row(9383, 9)], opts);
  a.press(0); b.press(0); a.step(100); b.step(100);
  assert.equal(new Set(owners).size, 2);
  a.release(true, 100); a.setAuthoritativeState(0, { active: true }, 150); a.step(200);
  assert.equal(a.snapshot()[0].finished, true);
});

test('all nine recovered dispatch targets match address-pinned jump table', () => {
  for (const [button, expected, latched] of [
    [row(18700, 3), [1,0,0,0,0,1,0,0,0], [1,0,0,0,0,1,0,0,0]],
    [row(9383, 9), [1,0,2,0,0,1,2,0,0], [1,0,0,2,0,1,2,2,0]],
    [row(9383, 6), [1,0,3,0,0,1,3,3,0], [1,0,3,0,0,1,3,3,0]],
  ]) {
    for (let offset = 0; offset <= 8; offset++) {
      for (const active of [false, true]) {
        const c = build([button]);
        if (active) c.dispatch(0, 0x2006);
        c.dispatch(0, 0x2000 + offset);
        assert.equal(c.snapshot()[0].state, (active ? latched : expected)[offset], `${button.name}, active=${active}, event=${offset}`);
      }
    }
  }
});

test('channel2 gates terminal and replacing a channel stops its previous owned handle', () => {
  let done = false; const stops = [];
  const clip = { script: 1, tickMs: 10, endCheckTick: 3,
    frames: [{ tick: 0, parts: [] }, { tick: 2, parts: [] }],
    sounds: [{ tick: 0, sound: 1, channel: 2 }, { tick: 1, sound: 2, channel: 2 }] };
  const c = createActionStateController({ buttons: [{ ...row(18700, 3), stateScripts: [1,1,0,0] }], scripts: { 1: clip } },
    { now: () => 0, playSound: cue => ({ stop: () => stops.push(cue.sound), isComplete: () => done }) });
  c.step(10); assert.deepEqual(stops, [1]); c.step(20); c.step(30);
  assert.equal(c.snapshot()[0].tick, 2); assert.equal(c.snapshot()[0].finished, false);
  done = true; c.step(40); assert.equal(c.snapshot()[0].finished, true);
  c.dispose(); assert.deepEqual(stops, [1, 2]);
});

import { actionManifest, actionProfile, actionStates } from '../../src/native-action-motion.js';
test('action manifest qualifies repeated sprite IDs and preserves registered geometry and auxiliary-only clips', () => {
  const buttons = [9,10].map((index,i) => ({...row(9383,index),
    region: {status:'exact',type:'rectangle-union',boundsXYWH:[10,20,5,6],rectsLTRB:[[10,20,15,26]]},
    auxiliaryClipRect:[11,21,2,3],stateScripts:[i*3+1,i*3+2,i*3+2,0],rolloverScript:i*3+3}));
  const source={tables:{9383:{buttons}},scripts:{},sprites:{},sounds:{}};
  for(let i=0;i<2;i++) for(let j=1;j<=3;j++) {
    source.scripts[i*3+j]={script:i*3+j,collection:i+100,frames:[{tick:0,parts:[{sprite:7,x:3,y:4,registrationXY:[2,-3]}]}]};
    source.sprites[`${i+100}:7`]={width:8,height:9,image:'test.png'};
  }
  const manifest=actionManifest(source,{table:9383,rows:[9,10]});
  assert.deepEqual(Object.keys(manifest.sprites),['100:7','101:7']);
  assert.equal(manifest.scripts[4].frames[0].parts[0].sprite,'101:7');
  assert.deepEqual(manifest.buttons[0].auxiliaryClipRect,[11,21,2,3]);
  assert.equal(manifest.buttons[0].region,buttons[0].region);
  assert.equal(source.scripts[4].frames[0].parts[0].sprite,7);
  delete source.sprites['101:7']; assert.throws(()=>actionManifest(source,{table:9383,rows:[9,10]}),/Missing action sprite/);
});
test('action profiles bind ten Text controls and existing Hand/Scissors actions with explicit authoritative state', () => {
  assert.deepEqual(actionProfile({tray:'text'}).rows,[2,3,4,5,6,7,8,9,10,11]);
  assert.deepEqual(actionProfile({tray:'grab',selected:'scissors'}).rows,[2,3,4]);
  assert.equal(actionProfile({tray:'stamp'}),null);
  const manifest={buttons:['bold','italic','underline','align:right','edit:paste'].map(action=>({action}))};
  assert.deepEqual(actionStates(manifest,{bold:true,underline:true,align:'right',capabilities:{paste:false}}),[
    {active:true,disabled:false},{active:false,disabled:false},{active:true,disabled:false},
    {active:true,disabled:false},{active:false,disabled:true}]);
});

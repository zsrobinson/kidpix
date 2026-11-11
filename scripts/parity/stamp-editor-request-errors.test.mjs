import {test} from 'node:test';
import assert from 'node:assert/strict';
import {unexpectedStampRequests} from '../../tests/browser/stamp-request-errors.js';

test('WebKit cleanup requires the exact aborted fetch identity',()=>{
 const failure={error:'Load request cancelled',url:'/original/ui/tool-motion/draw/sprites.bin',fetchId:'first'};
 assert.deepEqual(unexpectedStampRequests([failure],['first']),[]);
 assert.deepEqual(unexpectedStampRequests([failure],[]),[`${failure.error} ${failure.url}`]);
 assert.deepEqual(unexpectedStampRequests([{...failure,fetchId:'second'}],['first']),[`${failure.error} ${failure.url}`]);
});
test('an unmarked cancelled request remains a loading failure',()=>{
 const failure={error:'Load request cancelled',url:'/original/ui/stamp-editor/frame.png'};
 assert.deepEqual(unexpectedStampRequests([failure],['other']),[`${failure.error} ${failure.url}`]);
});
test('transport failures remain failures even when their controller later aborts',()=>{
 const failures=['Could not connect to the server','net::ERR_FAILED'].map(error=>({error,url:'/original/ui/missing',fetchId:'aborted'}));
 assert.equal(unexpectedStampRequests(failures,['aborted']).length,2);
});
test('the existing Chromium abort disposition is preserved',()=>{
 assert.deepEqual(unexpectedStampRequests([{error:'net::ERR_ABORTED',url:'/original/ui/fixture'}],[]),[]);
});

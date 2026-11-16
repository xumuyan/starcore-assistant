// Offline tests for the renderer/IPC acknowledgment protocol and
// single-consumer identity authentication (SC-20261115-012).
// No real UI, input, clipboard or service; default remains off.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DictationRendererAckProtocol, ackKeys, ackTypes, newIdentity, protocolStates } from '../test-helpers/dictation-renderer-ack-protocol.mjs';
import { validPresentation } from '../test-helpers/dictation-presentation-worker.mjs';

const presentation = { status: 'final-ready', text: 'hi', truncated: false,
  level: 0.5, showOrbs: true, canCopy: true, awaitingStop: false, executorWaiting: false };
assert.ok(validPresentation(presentation));


test('protocol surface and default-off behavior', () => {
  assert.deepEqual([...ackTypes].sort(), ['hidden-ack', 'rendered']);
  assert.deepEqual([...ackKeys], ['type', 'id', 'consumer']);
  assert.deepEqual([...protocolStates].sort(), ['failed', 'hidden', 'idle', 'pending', 'rendered'].sort());
  const off = new DictationRendererAckProtocol({});
  assert.equal(off.enabled, false);
  assert.deepEqual(off.registerConsumer({ token: newIdentity() }), { accepted: false, reason: 'disabled' });
  assert.deepEqual(off.sendPrepare(crypto.randomUUID(), presentation), { accepted: false, reason: 'disabled' });
  assert.deepEqual(off.receiveAck({ type: 'rendered', id: crypto.randomUUID(), consumer: crypto.randomUUID() }),
    { accepted: false, reason: 'disabled' });
  assert.throws(() => new DictationRendererAckProtocol({ enabled: true, onFail: 'x' }), TypeError);
});

test('single-consumer identity: exactly one binding, no rebinding after retire', () => {
  const protocol = new DictationRendererAckProtocol({ enabled: true });
  const first = protocol.registerConsumer({ token: newIdentity() });
  assert.equal(first.accepted, true);
  assert.equal(protocol.consumerAuthenticated, true);
  assert.deepEqual(protocol.registerConsumer({ token: newIdentity() }), { accepted: false, reason: 'consumer-already-bound' });
  assert.equal(protocol.retireConsumer({ token: 'not-the-token' }).accepted, false);
  assert.equal(protocol.retireConsumer({ token: first.consumer }).accepted, true);
  assert.equal(protocol.consumerAuthenticated, false);
  assert.deepEqual(protocol.registerConsumer({ token: newIdentity() }), { accepted: false, reason: 'consumer-already-bound' });
  assert.deepEqual(protocol.sendPrepare(crypto.randomUUID(), presentation), { accepted: false, reason: 'no-authenticated-consumer' });
  assert.equal(protocol.state, 'failed'); // retirement fail-closed the protocol
});

test('prepare -> presentation update -> rendered ack happy path', () => {
  const protocol = new DictationRendererAckProtocol({ enabled: true });
  const { consumer } = protocol.registerConsumer({ token: newIdentity() });
  const id = crypto.randomUUID();
  const sent = protocol.sendPrepare(id, presentation);
  assert.equal(sent.accepted, true);
  assert.deepEqual(sent.message, { type: 'prepare', id, presentation });
  assert.equal(protocol.state, 'pending');
  // Renderer side validates and produces the exact ack after its DOM update.
  const received = protocol.rendererReceive(sent.message, { token: consumer });
  assert.equal(received.accepted, true);
  assert.deepEqual(received.ack, { type: 'rendered', id, consumer });
  const acked = protocol.receiveAck(received.ack);
  assert.deepEqual(acked, { accepted: true, state: 'rendered', id });
  assert.equal(protocol.state, 'rendered');
  assert.equal(protocol.stats.acksAccepted, 1);
});

test('hide path: prepare-hide requires hidden-ack', () => {
  const protocol = new DictationRendererAckProtocol({ enabled: true });
  const { consumer } = protocol.registerConsumer({ token: newIdentity() });
  const id = crypto.randomUUID();
  protocol.sendPrepare(crypto.randomUUID(), presentation);
  assert.equal(protocol.supersede().accepted, true);
  const sent = protocol.sendHide(id);
  assert.equal(sent.accepted, true);
  const received = protocol.rendererReceive(sent.message, { token: consumer });
  assert.equal(received.accepted, true);
  assert.equal(received.display, null);
  assert.deepEqual(protocol.receiveAck(received.ack), { accepted: true, state: 'hidden', id });
});

test('late ack (superseded id) is fail-closed', () => {
  const protocol = new DictationRendererAckProtocol({ enabled: true });
  const { consumer } = protocol.registerConsumer({ token: newIdentity() });
  const oldId = crypto.randomUUID();
  const oldSent = protocol.sendPrepare(oldId, presentation);
  protocol.supersede();
  protocol.sendPrepare(crypto.randomUUID(), presentation);
  const oldAck = protocol.rendererReceive(oldSent.message, { token: consumer }).ack;
  const result = protocol.receiveAck(oldAck);
  assert.deepEqual(result, { accepted: false, reason: 'stray-ack', state: 'failed' });
  assert.equal(protocol.state, 'failed');
  assert.deepEqual(protocol.sendPrepare(crypto.randomUUID(), presentation), { accepted: false, reason: 'protocol-failed' });
});

test('duplicate ack for settled job is fail-closed', () => {
  const protocol = new DictationRendererAckProtocol({ enabled: true });
  const { consumer } = protocol.registerConsumer({ token: newIdentity() });
  const id = crypto.randomUUID();
  const sent = protocol.sendPrepare(id, presentation);
  const ack = protocol.rendererReceive(sent.message, { token: consumer }).ack;
  assert.equal(protocol.receiveAck(ack).accepted, true);
  const result = protocol.receiveAck(ack); // same ack replayed
  assert.deepEqual(result, { accepted: false, reason: 'duplicate-ack', state: 'failed' });
  assert.equal(protocol.state, 'failed');
});

test('unknown/stray ack is fail-closed', () => {
  const protocol = new DictationRendererAckProtocol({ enabled: true });
  protocol.registerConsumer({ token: newIdentity() });
  const result = protocol.receiveAck({ type: 'rendered', id: crypto.randomUUID(), consumer: protocol.consumerAuthenticated ? undefined : undefined });
  assert.equal(result.accepted, false);
  assert.equal(protocol.state, 'failed');
});

test('malformed acks: extra/missing fields, bad id, unknown type are fail-closed', () => {
  for (const message of [
    { type: 'rendered', id: crypto.randomUUID(), consumer: crypto.randomUUID(), extra: 1 },
    { type: 'rendered', id: crypto.randomUUID() },
    { type: 'rendered', id: 'not-a-uuid', consumer: crypto.randomUUID() },
    { type: 'surprise', id: crypto.randomUUID(), consumer: crypto.randomUUID() },
    { type: 'rendered', id: crypto.randomUUID(), consumer: 'short' },
    'rendered',
  ]) {
    const protocol = new DictationRendererAckProtocol({ enabled: true });
    protocol.registerConsumer({ token: newIdentity() });
    assert.equal(protocol.receiveAck(message).accepted, false, JSON.stringify(message));
    assert.equal(protocol.state, 'failed');
  }
});

test('second consumer and impersonation are rejected fail-closed', () => {
  const protocol = new DictationRendererAckProtocol({ enabled: true });
  const { consumer } = protocol.registerConsumer({ token: newIdentity() });
  const id = crypto.randomUUID();
  const sent = protocol.sendPrepare(id, presentation);
  // A second (unregistered) consumer observed the prepare and answers with its own token.
  const impostor = newIdentity();
  const result = protocol.receiveAck({ type: 'rendered', id, consumer: impostor });
  assert.deepEqual(result, { accepted: false, reason: 'unauthenticated-consumer', state: 'failed' });
  assert.equal(protocol.state, 'failed');
  // Even the real token cannot settle a failed protocol.
  assert.equal(protocol.receiveAck({ type: 'rendered', id, consumer }).accepted, false);
  // Renderer side refuses to serve an unauthenticated claimant.
  const fresh = new DictationRendererAckProtocol({ enabled: true });
  fresh.registerConsumer({ token: newIdentity() });
  assert.deepEqual(fresh.rendererReceive({ type: 'prepare', id: crypto.randomUUID(), presentation }, { token: impostor }), { accepted: false, reason: 'unauthenticated' });
});

test('renderer rejects malformed prepares and never echoes display on failure', () => {
  const protocol = new DictationRendererAckProtocol({ enabled: true });
  const { consumer } = protocol.registerConsumer({ token: newIdentity() });
  assert.equal(protocol.rendererReceive({ type: 'prepare', id: crypto.randomUUID(), presentation: { status: 'final-ready' } }, { token: consumer }).accepted, false);
  assert.equal(protocol.rendererReceive({ type: 'prepare', id: crypto.randomUUID(), presentation, extra: true }, { token: consumer }).accepted, false);
  assert.equal(protocol.rendererReceive('prepare', { token: consumer }).accepted, false);
});

test('one job in flight: concurrent prepare rejected until supersede', () => {
  const protocol = new DictationRendererAckProtocol({ enabled: true });
  protocol.registerConsumer({ token: newIdentity() });
  protocol.sendPrepare(crypto.randomUUID(), presentation);
  assert.deepEqual(protocol.sendPrepare(crypto.randomUUID(), presentation), { accepted: false, reason: 'job-in-flight' });
  assert.equal(protocol.supersede().accepted, true);
  assert.equal(protocol.sendPrepare(crypto.randomUUID(), presentation).accepted, true);
  assert.equal(protocol.supersede().accepted, true); // the second job was pending
  assert.deepEqual(protocol.supersede(), { accepted: false, reason: 'nothing-pending' });
});

test('onFail hook observes each fail-closed latch with its reason', () => {
  const reasons = [];
  const protocol = new DictationRendererAckProtocol({ enabled: true, onFail: reason => reasons.push(reason) });
  protocol.registerConsumer({ token: newIdentity() });
  protocol.receiveAck({ type: 'rendered', id: crypto.randomUUID(), consumer: crypto.randomUUID() });
  assert.deepEqual(reasons, ['unauthenticated-consumer']);
});

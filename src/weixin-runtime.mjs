// SDK 0.5.0 only checks HTTP status on sendmessage. Also check the protocol result
// so HTTP 200 with an expired context token is never recorded as successful.
export function installSendGuard({ filterInbound } = {}) {
  const original = globalThis.fetch;
  globalThis.fetch = async (...args) => {
    const response = await original(...args);
    const url = new URL(typeof args[0] === 'string' ? args[0] : args[0].url ?? args[0]);
    if (filterInbound && url.pathname === '/ilink/bot/getupdates' && response.ok) {
      const body = await response.clone().json();
      if (Array.isArray(body.msgs)) {
        const filtered = filterInbound(body);
        const headers = new Headers(response.headers);
        headers.delete('content-length');
        headers.delete('content-encoding');
        return new Response(JSON.stringify(filtered), { status: response.status, headers });
      }
    }
    if (url.pathname === '/ilink/bot/sendmessage' && response.ok) {
      const data = await response.clone().json();
      // The Tencent protocol makes both fields optional. Absence isn't an error;
      // reject only explicit nonzero codes, including errcode with ret missing/0.
      if (Number(data.ret ?? 0) !== 0 || Number(data.errcode ?? 0) !== 0) {
        throw new Error('微信未确认接收消息，请重新发送“开启提醒”或重新绑定。');
      }
    }
    return response;
  };
  return () => { globalThis.fetch = original; };
}

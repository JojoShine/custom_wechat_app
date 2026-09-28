export const demoPage = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="referrer" content="no-referrer">
  <title>轻购实验室 · 网页示例</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; padding: 28px 20px 64px; background: #f8f5e9; color: #163d34; font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif; }
    header, section { max-width: 600px; margin: 0 auto 20px; padding: 25px; border: 3px solid #164b3c; border-radius: 4px; box-shadow: 6px 6px 0 #d9d3bd; }
    header { background: #b9e6f3; }
    section { background: #fffbef; }
    small { display: block; color: #175945; font-size: 12px; font-weight: 900; letter-spacing: 2px; }
    h1 { margin: 10px 0 6px; font-size: 32px; }
    h2 { margin: 0 0 12px; font-size: 20px; }
    p { line-height: 1.6; }
    .row { margin: 10px 0; overflow-wrap: anywhere; }
    .label { color: #5c7167; font-size: 13px; font-weight: 700; }
    .value { display: block; margin-top: 3px; font-weight: 700; }
    #avatar { display: none; width: 56px; height: 56px; margin-top: 12px; border: 3px solid #164b3c; object-fit: cover; }
  </style>
</head>
<body>
  <header><small>QINGGOU / WEB DEMO</small><h1>轻购实验室</h1><p>网页应用接入示例</p></header>
  <section><h2>连接状态</h2><p id="status" role="status">正在检查入口…</p></section>
  <section><h2>用户资料</h2><div id="profile">等待票据兑换</div><img id="avatar" alt="用户头像"></section>
  <section><h2>本次位置</h2><p id="location">未携带位置</p></section>
  <script>
    (async function () {
      const params = new URL(window.location.href);
      const appId = params.searchParams.get('appId');
      const ticket = params.searchParams.get('ticket');
      params.searchParams.delete('ticket');
      window.history.replaceState(null, '', params.pathname + params.search + params.hash);
      const status = document.getElementById('status');
      const location = document.getElementById('location');
      const latitude = Number(params.searchParams.get('latitude'));
      const longitude = Number(params.searchParams.get('longitude'));
      if (params.searchParams.has('latitude') && params.searchParams.has('longitude') && params.searchParams.get('coordinateSystem') === 'gcj02' && Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180) {
        location.textContent = 'GCJ-02 · 纬度 ' + latitude + ' · 经度 ' + longitude;
      }
      if (!appId || !ticket) {
        status.textContent = '入口票据缺失，请从小程序重新进入。';
        return;
      }
      let accessToken = '';
      try {
        const exchange = await fetch('/webview/exchange', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ appId, ticket }) });
        if (!exchange.ok) throw new Error('exchange failed');
        const tokens = await exchange.json();
        accessToken = tokens.accessToken;
        const response = await fetch('/webview/me', { headers: { Authorization: 'Bearer ' + accessToken } });
        if (!response.ok) throw new Error('profile failed');
        const user = await response.json();
        const profile = document.getElementById('profile');
        profile.replaceChildren();
        for (const [label, value] of [['用户 ID', user.id], ['昵称', user.nickname || '未设置'], ['手机号', user.phoneBound ? '已绑定' : '未绑定']]) {
          const row = document.createElement('div');
          row.className = 'row';
          const caption = document.createElement('span');
          caption.className = 'label';
          caption.textContent = label;
          const content = document.createElement('span');
          content.className = 'value';
          content.textContent = value;
          row.append(caption, content);
          profile.append(row);
        }
        if (user.avatarUrl) {
          const avatar = document.getElementById('avatar');
          avatar.src = user.avatarUrl;
          avatar.style.display = 'block';
        }
        status.textContent = '连接成功。此页面不会保存令牌；失效后请从小程序重新进入。';
      } catch {
        status.textContent = '票据或登录已失效，请从小程序重新进入。';
      }
    })();
  </script>
</body>
</html>`

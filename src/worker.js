export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const originalPath = url.pathname;

    const tryAsset = async (pathname) => {
      const nextUrl = new URL(request.url);
      nextUrl.pathname = pathname;
      return env.ASSETS.fetch(new Request(nextUrl, request));
    };

    let response = await tryAsset(originalPath);
    if (response.status !== 404) return response;

    if (!originalPath.endsWith('/')) {
      response = await tryAsset(`${originalPath}.html`);
      if (response.status !== 404) return response;

      response = await tryAsset(`${originalPath}/index.html`);
      if (response.status !== 404) return response;
    }

    if (originalPath.endsWith('/')) {
      response = await tryAsset(`${originalPath}index.html`);
      if (response.status !== 404) return response;

      const trimmed = originalPath.replace(/\/$/, '');
      response = await tryAsset(`${trimmed}.html`);
      if (response.status !== 404) return response;
    }

    return tryAsset('/404.html');
  }
};

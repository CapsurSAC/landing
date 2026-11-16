import { FakeCatalogCache } from '../../../test/support/fakes';
import { promotionsCacheKey, specialtiesCacheKey } from '../../application/use-cases/catalog-cache-keys';
import { HttpCatalogChangeNotifier } from './catalog-change-notifier';

describe('HttpCatalogChangeNotifier (B8)', () => {
  async function seededCache(): Promise<FakeCatalogCache> {
    const cache = new FakeCatalogCache();
    await cache.set(promotionsCacheKey('sis'), { items: [] }, 60);
    await cache.set(specialtiesCacheKey('sis', 'ia'), { items: [] }, 60);
    await cache.set(promotionsCacheKey('otra'), { items: [] }, 60);
    return cache;
  }

  it('invalida solo la caché de la marca y pide a la landing revalidar la etiqueta catalog', async () => {
    const cache = await seededCache();
    const fetchImpl = jest.fn().mockResolvedValue(new Response(null, { status: 200 }));
    const notifier = new HttpCatalogChangeNotifier(cache, {
      url: 'http://web/api/revalidate',
      secret: 'secreto',
      fetchImpl,
    });

    await notifier.catalogChanged('sis');

    expect([...cache.store.keys()]).toEqual([promotionsCacheKey('otra')]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://web/api/revalidate');
    expect((init.headers as Record<string, string>)['x-revalidate-secret']).toBe('secreto');
    expect(JSON.parse(init.body as string)).toEqual({ tags: ['catalog'] });
  });

  it('no lanza si la landing falla o no responde', async () => {
    const cache = await seededCache();
    const failing = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const rejecting = jest.fn().mockResolvedValue(new Response(null, { status: 401 }));

    await expect(
      new HttpCatalogChangeNotifier(cache, { url: 'http://web', secret: 's', fetchImpl: failing }).catalogChanged('sis'),
    ).resolves.toBeUndefined();
    await expect(
      new HttpCatalogChangeNotifier(cache, { url: 'http://web', secret: 's', fetchImpl: rejecting }).catalogChanged('sis'),
    ).resolves.toBeUndefined();
  });

  it('sin URL o secreto solo invalida la caché propia', async () => {
    const cache = await seededCache();
    const fetchImpl = jest.fn();
    await new HttpCatalogChangeNotifier(cache, { fetchImpl }).catalogChanged('sis');
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(cache.store.has(promotionsCacheKey('sis'))).toBe(false);
  });
});

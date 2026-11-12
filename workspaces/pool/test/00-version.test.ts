import LibPQ from '@juit/libpq'
import { $ylw } from '@plugjs/build'

describe('LibPQ version', () => {
  it('show versions', () => {
    const pq = new LibPQ()
    log('LibPQ version ..............', $ylw(pq.versions.libpq))
    log('NodeJS version .............', $ylw(process.versions.node))
    log('OpenSSL version (LibPQ) ....', $ylw(pq.versions.openssl))
    log('OpenSSL version (NodeJS) ...', $ylw(process.versions.openssl))
    pq.finish()
  })
})

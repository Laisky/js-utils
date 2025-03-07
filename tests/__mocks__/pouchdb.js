import { jest } from '@jest/globals';

// Simple mock for PouchDB
export default class PouchDB {
    constructor() {
        this.db = {};
    }

    put(doc) {
        this.db[doc._id] = doc;
        return Promise.resolve({ ok: true, id: doc._id, rev: '1-mock' });
    }

    get(id) {
        if (this.db[id]) {
            return Promise.resolve(this.db[id]);
        }
        return Promise.reject(new Error('not_found'));
    }

    allDocs() {
        return Promise.resolve({
            rows: Object.keys(this.db).map(key => ({
                id: key,
                doc: this.db[key]
            }))
        });
    }
}

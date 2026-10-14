import { DurableObject } from 'cloudflare:workers';
import { OwnerOutbox } from './owner-store.mjs';
export class MysticalWhimseyOwner extends DurableObject {
  constructor(ctx,env) {super(ctx,env);this.outbox=new OwnerOutbox(ctx.storage);}
  async identity(){return this.outbox.identity();}
  async prepare(hours){return this.outbox.prepare(hours);}
  async confirm(crossingId,received,held,pinned){return this.outbox.confirm(crossingId,received,held,pinned);}
  async state(){return this.outbox.snapshot();}
}

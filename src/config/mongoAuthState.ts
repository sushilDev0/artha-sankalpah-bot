import mongoose from 'mongoose';
import { initAuthCreds, BufferJSON, proto } from '@whiskeysockets/baileys';
import type { AuthenticationState, SignalDataTypeMap } from '@whiskeysockets/baileys';

const AuthSchema = new mongoose.Schema({ _id: String, data: String }, { versionKey: false });
const AuthModel = (mongoose.models['BaileysAuth'] as mongoose.Model<any>) || mongoose.model<any>('BaileysAuth', AuthSchema);

const write = (id: string, value: unknown) =>
  AuthModel.updateOne({ _id: id }, { data: JSON.stringify(value, BufferJSON.replacer) }, { upsert: true });
const read = async (id: string) => {
  const doc: any = await AuthModel.findById(id).lean();
  return doc ? JSON.parse(doc.data, BufferJSON.reviver) : null;
};
const remove = (id: string) => AuthModel.deleteOne({ _id: id });

export async function useMongoAuthState(): Promise<{ state: AuthenticationState; saveCreds: () => Promise<void> }> {
  const creds = (await read('creds')) ?? initAuthCreds();
  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const out: { [id: string]: SignalDataTypeMap[typeof type] } = {};
          await Promise.all(ids.map(async (id) => {
            let v = await read(`${type}-${id}`);
            if (type === 'app-state-sync-key' && v) v = proto.Message.AppStateSyncKeyData.fromObject(v);
            if (v) out[id] = v;
          }));
          return out;
        },
        set: async (data) => {
          const tasks: Promise<unknown>[] = [];
          for (const category in data) {
            const entries = (data as any)[category];
            for (const id in entries) {
              const v = entries[id];
              tasks.push(v ? write(`${category}-${id}`, v) : remove(`${category}-${id}`));
            }
          }
          await Promise.all(tasks);
        },
      },
    },
    saveCreds: async () => { await write('creds', creds); },
  };
}
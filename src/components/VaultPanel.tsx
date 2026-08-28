"use client";

import { useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useEncryption, hasRecoverySession, clearRecoverySession } from "./EncryptionContext";
import {
  deriveKey,
  deriveRecoveryKey,
  decryptNode,
  decryptString,
  encryptNode,
  encryptString,
  exportKeyB64,
  generateRecoveryCode,
  recoveryVerifier,
  toPlainNode,
  wrapKeyB64,
} from "@/lib/crypto";
import { decodeHistoryPayload, encodeHistoryPayload } from "@/lib/recur";
import {
  buildExportFile,
  countsToRecord,
  downloadExportFile,
  exportFilename,
  importOrder,
  openExportFile,
  recordToCounts,
} from "@/lib/vaultFile";

// In-vault settings: change the sign-in password and manage the recovery key.
// The vault master key never changes — only its wrappers are re-keyed, so no
// data re-encryption is needed and other devices keep working.
export function VaultPanel({ onClose }: { onClose: () => void }) {
  const { key, salt } = useEncryption();
  const recovery = useQuery(api.vault.getRecovery);
  const changePasswordAction = useAction(api.vault.changePassword);
  const putKeyRecord = useMutation(api.vault.putKeyRecord);
  const setRecoveryMut = useMutation(api.vault.setRecovery);
  const clearRecoveryMut = useMutation(api.vault.clearRecovery);
  const todoRecords = useQuery(api.todos.list);
  const historyRecords = useQuery(api.history.list);
  const createTodoMut = useMutation(api.todos.create);
  const historyPutMut = useMutation(api.history.put);

  const recoverySession = hasRecoverySession();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [recoveryCode, setRecoveryCode] = useState<string | null>(null);
  const [recoveryBusy, setRecoveryBusy] = useState(false);

  const [exportPass, setExportPass] = useState("");
  const [exportPass2, setExportPass2] = useState("");
  const [exportBusy, setExportBusy] = useState(false);
  const [importPass, setImportPass] = useState("");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [ioMsg, setIoMsg] = useState<string | null>(null);
  const [ioErr, setIoErr] = useState<string | null>(null);

  async function submitChange(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setMsg(null);
    if (!key || !salt) return;
    if (!recoverySession && current.length < 8) {
      setErr("enter your current password.");
      return;
    }
    if (next.length < 8) {
      setErr("new password must be at least 8 characters.");
      return;
    }
    if (next.length > 128) {
      setErr("password is too long.");
      return;
    }
    if (next !== confirm) {
      setErr("passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      // pre-compute the new wrapper BEFORE touching auth credentials — if the
      // server call succeeds we must be able to persist the matching wrapper
      const kpwNew = await deriveKey(next, salt);
      const wrapped = await wrapKeyB64(kpwNew, await exportKeyB64(key));
      await changePasswordAction({
        newPassword: next,
        ...(recoverySession ? {} : { currentPassword: current }),
      });
      let persisted = false;
      for (let i = 0; i < 3; i++) {
        try {
          await putKeyRecord({ kind: "password", ...wrapped });
          persisted = true;
          break;
        } catch {
          await new Promise((r) => setTimeout(r, 1200));
        }
      }
      if (!persisted) {
        setErr("password changed, but the vault wrapper update failed — press save again to retry.");
        return;
      }
      clearRecoverySession();
      setCurrent("");
      setNext("");
      setConfirm("");
      setMsg("password changed.");
    } catch (e) {
      setErr(e instanceof Error ? e.message.toLowerCase() : "failed to change password");
    } finally {
      setBusy(false);
    }
  }

  async function generateRecovery() {
    if (!key || !salt) return;
    setRecoveryBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const code = generateRecoveryCode();
      const kr = await deriveRecoveryKey(code, salt);
      const verifier = await recoveryVerifier(kr);
      const wrapped = await wrapKeyB64(kr, await exportKeyB64(key));
      await setRecoveryMut({ verifier, ...wrapped });
      setRecoveryCode(code);
    } catch (e) {
      setErr(e instanceof Error ? e.message.toLowerCase() : "failed to generate recovery key");
    } finally {
      setRecoveryBusy(false);
    }
  }

  async function removeRecovery() {
    setRecoveryBusy(true);
    setErr(null);
    setMsg(null);
    try {
      await clearRecoveryMut({});
      setRecoveryCode(null);
      setMsg("recovery key removed.");
    } catch (e) {
      setErr(e instanceof Error ? e.message.toLowerCase() : "failed to remove recovery key");
    } finally {
      setRecoveryBusy(false);
    }
  }

  async function doExport() {
    if (!key) return;
    setIoErr(null);
    setIoMsg(null);
    if (exportPass.length < 8) {
      setIoErr("export passphrase must be at least 8 characters.");
      return;
    }
    if (exportPass !== exportPass2) {
      setIoErr("passphrases do not match.");
      return;
    }
    setExportBusy(true);
    try {
      const todos = [];
      for (const r of todoRecords ?? []) {
        if (!r.ciphertext || !r.iv) continue;
        todos.push({ id: r._id as string, node: await decryptNode(key, r.iv, r.ciphertext) });
      }
      const history = [];
      for (const r of historyRecords ?? []) {
        const data = decodeHistoryPayload(await decryptString(key, r.iv, r.ciphertext));
        if (data) history.push({ todoId: data.todoId, counts: countsToRecord(data.counts) });
      }
      const file = await buildExportFile({ v: 1, todos, history }, exportPass);
      downloadExportFile(file, exportFilename());
      setIoMsg(`exported ${todos.length} tasks and ${history.length} history records — keep the file and passphrase safe.`);
      setExportPass("");
      setExportPass2("");
    } catch (e) {
      setIoErr(e instanceof Error ? e.message.toLowerCase() : "export failed");
    } finally {
      setExportBusy(false);
    }
  }

  async function doImport() {
    if (!key) return;
    setIoErr(null);
    setIoMsg(null);
    if (!importFile) {
      setIoErr("choose a backup file first.");
      return;
    }
    if (importPass.length < 8) {
      setIoErr("enter the backup's export passphrase.");
      return;
    }
    setImportBusy(true);
    try {
      const snapshotData = await openExportFile(await importFile.text(), importPass);
      const order = importOrder(snapshotData.todos);
      if (!order) throw new Error("backup contains a cycle, duplicate ids, or a missing parent.");
      const byId = new Map(snapshotData.todos.map((t) => [t.id, t]));
      const idMap = new Map<string, string>();
      for (const oldId of order) {
        const src = byId.get(oldId)!;
        const node = toPlainNode({
          title: src.node.title,
          isCompleted: src.node.isCompleted,
          parentId: src.node.parentId ? (idMap.get(src.node.parentId) ?? null) : null,
          order: src.node.order,
          metadata: src.node.metadata,
        });
        const payload = await encryptNode(key, node);
        const newId = await createTodoMut(payload);
        idMap.set(oldId, newId as string);
      }
      let historyCount = 0;
      for (const h of snapshotData.history) {
        const newId = idMap.get(h.todoId);
        if (!newId) continue;
        const json = encodeHistoryPayload({ todoId: newId, counts: recordToCounts(h.counts) });
        await historyPutMut(await encryptString(key, json));
        historyCount++;
      }
      setIoMsg(`imported ${idMap.size} tasks and ${historyCount} history records.`);
      setImportPass("");
      setImportFile(null);
    } catch (e) {
      setIoErr(e instanceof Error ? e.message.toLowerCase() : "import failed");
    } finally {
      setImportBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-background/80 p-4 py-10" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="vault settings"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[460px] border border-foreground bg-background p-6"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium">vault settings</h2>
          <button onClick={onClose} className="opacity-60 hover:opacity-100" aria-label="close vault settings">
            close
          </button>
        </div>

        {msg && <p className="mt-3 border border-foreground/30 bg-foreground/5 px-3 py-2 text-xs">{msg}</p>}
        {err && <p className="mt-3 border border-foreground bg-background px-3 py-2 text-xs">{err}</p>}

        {/* ---- change password ---- */}
        <form onSubmit={submitChange} className="mt-4 border border-foreground/20 p-3">
          <p className="text-xs font-medium">change password</p>
          <p className="mt-1 text-[11px] leading-tight opacity-40">
            only the vault wrapper is re-keyed — tasks, history, and other devices are unaffected.
          </p>
          {recoverySession && (
            <p className="mt-1 text-[11px] leading-tight opacity-60">
              recovery session — no current password needed.
            </p>
          )}
          {!recoverySession && (
            <label className="mt-2 block">
              <span className="text-xs opacity-60">current password</span>
              <input
                type="password"
                autoComplete="current-password"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                className="mt-1 w-full border-b border-foreground bg-transparent py-1 text-sm focus:outline-none"
              />
            </label>
          )}
          <label className="mt-2 block">
            <span className="text-xs opacity-60">new password</span>
            <input
              type="password"
              autoComplete="new-password"
              minLength={8}
              maxLength={128}
              value={next}
              onChange={(e) => setNext(e.target.value)}
              className="mt-1 w-full border-b border-foreground bg-transparent py-1 text-sm focus:outline-none"
            />
          </label>
          <label className="mt-2 block">
            <span className="text-xs opacity-60">confirm new password</span>
            <input
              type="password"
              autoComplete="new-password"
              minLength={8}
              maxLength={128}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="mt-1 w-full border-b border-foreground bg-transparent py-1 text-sm focus:outline-none"
            />
          </label>
          <button
            type="submit"
            disabled={busy || !key}
            className="mt-3 border border-foreground bg-foreground px-3 py-1.5 text-xs text-background hover:opacity-90 disabled:opacity-40"
          >
            {busy ? "saving…" : "change password"}
          </button>
        </form>

        {/* ---- recovery key ---- */}
        <div className="mt-3 border border-foreground/20 p-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium">recovery key</p>
            {recovery !== undefined && (
              <span className="text-[11px] opacity-40">
                {recovery ? `set ${new Date(recovery.createdAt).toLocaleDateString()}` : "not set"}
              </span>
            )}
          </div>
          <p className="mt-1 text-[11px] leading-tight opacity-40">
            lets you sign in and unlock the vault if you forget your password. shown once — store it somewhere safe.
          </p>
          {recoveryCode ? (
            <div className="mt-2">
              <div className="border border-foreground bg-foreground/5 p-3 text-center font-mono text-sm tracking-wider">
                {recoveryCode}
              </div>
              <div className="mt-2 flex gap-2">
                <button
                  onClick={() => void navigator.clipboard?.writeText(recoveryCode).catch(() => {})}
                  className="border border-foreground px-2 py-1 text-[11px] hover:bg-foreground/10"
                >
                  copy
                </button>
                <button
                  onClick={() => setRecoveryCode(null)}
                  className="border border-foreground px-2 py-1 text-[11px] hover:bg-foreground/10"
                >
                  done — i saved it
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-2 flex gap-2">
              <button
                onClick={generateRecovery}
                disabled={recoveryBusy || !key}
                className="border border-foreground px-2 py-1 text-[11px] hover:bg-foreground/10 disabled:opacity-40"
              >
                {recoveryBusy ? "working…" : recovery ? "replace key" : "generate recovery key"}
              </button>
              {recovery && (
                <button
                  onClick={removeRecovery}
                  disabled={recoveryBusy}
                  className="border border-foreground px-2 py-1 text-[11px] opacity-60 hover:opacity-100 disabled:opacity-40"
                >
                  remove
                </button>
              )}
            </div>
          )}
        </div>

        {/* ---- export / import ---- */}
        <div className="mt-3 border border-foreground/20 p-3">
          <p className="text-xs font-medium">export / import</p>
          <p className="mt-1 text-[11px] leading-tight opacity-40">
            passphrase-encrypted backup file, portable to any account. importing adds the backup
            tasks alongside existing ones.
          </p>

          {ioMsg && <p className="mt-2 border border-foreground/30 bg-foreground/5 px-3 py-2 text-xs">{ioMsg}</p>}
          {ioErr && <p className="mt-2 border border-foreground bg-background px-3 py-2 text-xs">{ioErr}</p>}

          <div className="mt-2 border-t border-foreground/10 pt-2">
            <p className="text-[11px] opacity-60">export (choose a passphrase for the file)</p>
            <label className="mt-1 block">
              <span className="text-xs opacity-60">passphrase</span>
              <input
                type="password"
                autoComplete="new-password"
                minLength={8}
                maxLength={128}
                value={exportPass}
                onChange={(e) => setExportPass(e.target.value)}
                className="mt-1 w-full border-b border-foreground bg-transparent py-1 text-sm focus:outline-none"
              />
            </label>
            <label className="mt-2 block">
              <span className="text-xs opacity-60">confirm passphrase</span>
              <input
                type="password"
                autoComplete="new-password"
                minLength={8}
                maxLength={128}
                value={exportPass2}
                onChange={(e) => setExportPass2(e.target.value)}
                className="mt-1 w-full border-b border-foreground bg-transparent py-1 text-sm focus:outline-none"
              />
            </label>
            <button
              onClick={doExport}
              disabled={exportBusy || !key || todoRecords === undefined || historyRecords === undefined}
              className="mt-2 border border-foreground px-2 py-1 text-[11px] hover:bg-foreground/10 disabled:opacity-40"
            >
              {exportBusy ? "exporting…" : "download encrypted export"}
            </button>
          </div>

          <div className="mt-3 border-t border-foreground/10 pt-2">
            <p className="text-[11px] opacity-60">import (restore or merge into this account)</p>
            <input
              type="file"
              accept="application/json,.json"
              onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
              className="mt-1 block w-full text-[11px] file:mr-2 file:border file:border-foreground file:bg-transparent file:px-2 file:py-0.5 file:text-[11px]"
            />
            <label className="mt-2 block">
              <span className="text-xs opacity-60">file passphrase</span>
              <input
                type="password"
                autoComplete="off"
                value={importPass}
                onChange={(e) => setImportPass(e.target.value)}
                className="mt-1 w-full border-b border-foreground bg-transparent py-1 text-sm focus:outline-none"
              />
            </label>
            <button
              onClick={doImport}
              disabled={importBusy || !key}
              className="mt-2 border border-foreground px-2 py-1 text-[11px] hover:bg-foreground/10 disabled:opacity-40"
            >
              {importBusy ? "importing…" : "import"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

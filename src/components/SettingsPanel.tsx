"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { decodeHistoryPayload, encodeHistoryPayload } from "@/lib/recur";
import { parseNode, encodeNode, toPlainNode } from "@/lib/crypto";
import { NudgeSettings } from "./DailyNudge";
import {
  buildExportFile,
  countsToRecord,
  downloadExportFile,
  exportFilename,
  importOrder,
  openExportFile,
  recordToCounts,
} from "@/lib/vaultFile";

// Settings — daily nudge plus export / import of a passphrase-protected backup
// file. The passphrase protects the downloaded file on disk; it is not a vault
// key and is never sent anywhere.

export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const todoRecords = useQuery(api.todos.list);
  const historyRecords = useQuery(api.history.list);
  const createTodoMut = useMutation(api.todos.create);
  const historyPutMut = useMutation(api.history.put);
  const unlockKeys = useQuery(api.unlockKeys.list);
  const issueKeyMut = useMutation(api.unlockKeys.issue);
  const revokeKeyMut = useMutation(api.unlockKeys.revoke);

  const [keyName, setKeyName] = useState("");
  const [freshKey, setFreshKey] = useState<string | null>(null);
  const [keyBusy, setKeyBusy] = useState(false);
  const [keyMsg, setKeyMsg] = useState<string | null>(null);
  const [keyCopied, setKeyCopied] = useState(false);

  const [exportPass, setExportPass] = useState("");
  const [exportPass2, setExportPass2] = useState("");
  const [exportBusy, setExportBusy] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPass, setImportPass] = useState("");
  const [importBusy, setImportBusy] = useState(false);
  const [ioMsg, setIoMsg] = useState<string | null>(null);
  const [ioErr, setIoErr] = useState<string | null>(null);

  async function doExport() {
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
        if (!r.node) continue;
        todos.push({ id: r._id as string, node: parseNode(r.node) });
      }
      const history = [];
      for (const r of historyRecords ?? []) {
        if (!r.payload) continue;
        const data = decodeHistoryPayload(r.payload);
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
        const newId = await createTodoMut({ node: encodeNode(node) });
        idMap.set(oldId, newId as string);
      }
      let historyCount = 0;
      for (const h of snapshotData.history) {
        const newId = idMap.get(h.todoId);
        if (!newId) continue;
        const payload = encodeHistoryPayload({ todoId: newId, counts: recordToCounts(h.counts) });
        await historyPutMut({ payload });
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
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-background/95 p-4 py-10" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="settings"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md border border-foreground bg-background p-3"
      >
        {/* same header bar as the help panel: mono title, ruled, underlined close */}
        <div className="-mx-3 -mt-3 flex items-center justify-between border-b border-foreground px-3 py-2">
          <p className="font-mono text-xs">settings</p>
          <button onClick={onClose} className="text-xs underline underline-offset-4 hover:opacity-60">
            close
          </button>
        </div>

        <NudgeSettings />

        <div className="mt-3 border-t border-foreground/20 pt-3">
          <p className="font-mono text-xs">integration key</p>
          <p className="mt-1 text-pretty text-[11px] leading-snug opacity-60">
            paste one key into the stopscrll android app — finishing a task there unblocks the
            phone. a key can only unlock — nothing else.
          </p>

          {freshKey && (
            <div className="mt-2 border border-foreground bg-foreground/5 p-2">
              <p className="text-[11px] opacity-60">copy now — it is never shown again:</p>
              <p className="mt-1 break-all font-mono text-xs">{freshKey}</p>
              <button
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(freshKey);
                    setKeyCopied(true);
                  } catch {
                    setKeyMsg("copy failed — select the key manually.");
                  }
                }}
                className="mt-2 border border-foreground px-2 py-1 text-[11px] hover:bg-foreground/10"
              >
                {keyCopied ? "copied ✓" : "copy to clipboard"}
              </button>
            </div>
          )}
          {keyMsg && <p className="mt-2 border border-foreground/30 px-3 py-2 text-xs">{keyMsg}</p>}

          <div className="mt-2 flex gap-2">
            <input
              value={keyName}
              onChange={(e) => setKeyName(e.target.value)}
              placeholder="label, e.g. pixel (optional)"
              maxLength={40}
              className="w-full border border-foreground/40 bg-transparent px-2 py-1.5 text-xs focus:border-foreground focus:outline-none"
            />
            <button
              onClick={async () => {
                setKeyMsg(null);
                setKeyCopied(false);
                setKeyBusy(true);
                try {
                  const r = await issueKeyMut({ name: keyName.trim() || undefined });
                  setFreshKey(r.key);
                  setKeyName("");
                } catch (e) {
                  setKeyMsg(e instanceof Error ? e.message.toLowerCase() : "issue failed");
                } finally {
                  setKeyBusy(false);
                }
              }}
              disabled={keyBusy || unlockKeys === undefined}
              className="shrink-0 border border-foreground px-2 py-1 text-[11px] hover:bg-foreground/10 disabled:opacity-40"
            >
              {keyBusy ? "issuing…" : "new key"}
            </button>
          </div>

          {(unlockKeys ?? []).length > 0 && (
            <ul className="mt-2 space-y-1">
              {(unlockKeys ?? []).map((k) => (
                <li key={k._id} className="flex items-center gap-2 text-[11px]">
                  <span className="font-mono opacity-60">{k.prefix}…</span>
                  <span className="flex-1 truncate opacity-60">
                    {k.name ?? "unnamed"} · {new Date(k.createdAt).toLocaleDateString()}
                    {k.lastUsedAt ? ` · used ${new Date(k.lastUsedAt).toLocaleDateString()}` : " · unused"}
                  </span>
                  <button
                    onClick={async () => {
                      if (freshKey) setFreshKey(null);
                      await revokeKeyMut({ id: k._id });
                    }}
                    className="border border-foreground/30 px-1.5 py-0.5 hover:bg-foreground/10"
                  >
                    revoke
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-3 border-t border-foreground/20 pt-3">
          <p className="font-mono text-xs">export / import</p>
          <p className="mt-1 text-pretty text-[11px] leading-snug opacity-60">
            passphrase-protected backup file, portable to any account. importing adds the backup
            tasks alongside existing ones.
          </p>

          {ioMsg && <p className="mt-2 border border-foreground/30 bg-foreground/5 px-3 py-2 text-xs">{ioMsg}</p>}
          {ioErr && <p className="mt-2 border border-foreground bg-background px-3 py-2 text-xs">{ioErr}</p>}

          <div className="mt-4">
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
                placeholder="at least 8 characters"
                className="mt-1 w-full border border-foreground/40 bg-transparent px-2 py-1.5 text-xs focus:border-foreground focus:outline-none"
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
                placeholder="repeat it"
                className="mt-1 w-full border border-foreground/40 bg-transparent px-2 py-1.5 text-xs focus:border-foreground focus:outline-none"
              />
            </label>
            <button
              onClick={doExport}
              disabled={exportBusy || todoRecords === undefined || historyRecords === undefined}
              className="mt-2 border border-foreground px-2 py-1 text-[11px] hover:bg-foreground/10 disabled:opacity-40"
            >
              {exportBusy ? "exporting…" : "download export"}
            </button>
          </div>

          <div className="mt-4">
            <p className="text-[11px] opacity-60">import (restore or merge into this account)</p>
            {/* the native file input speaks Title Case in its own font; hide it
                behind a label styled like every other button here */}
            <label className="mt-1 flex cursor-pointer items-center gap-2 text-[11px]">
              <input
                type="file"
                accept="application/json,.json"
                onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
                className="peer sr-only"
              />
              <span className="border border-foreground px-2 py-1 hover:bg-foreground/10 peer-focus-visible:outline peer-focus-visible:outline-1 peer-focus-visible:outline-offset-2">
                choose file
              </span>
              <span className="min-w-0 truncate font-mono opacity-60">{importFile ? importFile.name : "no file chosen"}</span>
            </label>
            <label className="mt-2 block">
              <span className="text-xs opacity-60">file passphrase</span>
              <input
                type="password"
                autoComplete="off"
                value={importPass}
                onChange={(e) => setImportPass(e.target.value)}
                placeholder="the passphrase the file was made with"
                className="mt-1 w-full border border-foreground/40 bg-transparent px-2 py-1.5 text-xs focus:border-foreground focus:outline-none"
              />
            </label>
            <button
              onClick={doImport}
              disabled={importBusy}
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
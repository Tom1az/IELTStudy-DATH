"use client";

import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { adminApi, ApiError } from "@/lib/api";
import type { Skill, SkillCategory } from "@/lib/types";
import { SKILL_CATEGORIES } from "@/lib/types";
import { useAsync } from "@/lib/hooks";
import { SKILL_META } from "@/lib/format";
import { ConfirmDialog, ErrorState, Modal, PageHeader, PageLoader, Select, Spinner, TextArea, TextInput, useToast } from "@/components/ui";
import { SkillTile } from "@/components/SkillIcon";

export default function SkillsPage() {
  const toast = useToast();
  const { data, error, loading, reload } = useAsync(() => adminApi.skills(), []);
  const [edit, setEdit] = useState<{ skill: Skill; isNew: boolean } | null>(null);
  const [del, setDel] = useState<Skill | null>(null);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);

  if (loading && !data) return <PageLoader />;
  if (error || !data) return <ErrorState error={error} onRetry={reload} />;

  const save = async () => {
    if (!edit) return;
    setPending(true);
    setErrs({});
    try { await adminApi.upsertSkill(edit.skill, edit.isNew); toast(edit.isNew ? "Skill added." : "Skill updated."); setEdit(null); reload(true); }
    catch (e) { if (e instanceof ApiError && e.fields) setErrs(e.fields); else toast((e as Error).message, "error"); }
    finally { setPending(false); }
  };

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader eyebrow="Admin" title="Skill taxonomy" actions={<button className="btn-primary" onClick={() => { setErrs({}); setEdit({ skill: { id: "", code: "", category: "reading", name: "", description: "", prerequisites: [] }, isNew: true }); }}><Plus className="h-4 w-4" /> Add micro-skill</button>}>
        The categories and micro-skills that lessons and questions are tagged with. The recommender and mastery map use this list.
      </PageHeader>
      <div className="space-y-6">
        {SKILL_CATEGORIES.map((c) => (
          <section key={c} className="overflow-hidden rounded-2xl border border-line bg-white">
            <h2 className="flex items-center gap-3 border-b border-line px-4 py-3 font-serif text-lg font-bold"><SkillTile skill={c} size={32} /> {SKILL_META[c].label}</h2>
            <div className="overflow-x-auto">
              <table className="table-base min-w-[760px]">
                <thead><tr><th>Code</th><th>Name</th><th>Builds on</th><th>Lessons</th><th>Questions</th><th /></tr></thead>
                <tbody>
                  {data.filter((s) => s.category === c).map((s) => (
                    <tr key={s.id}>
                      <td><code className="rounded bg-sand px-1.5 py-0.5 text-xs">{s.code}</code></td>
                      <td><p className="font-semibold">{s.name}</p><p className="text-xs text-ink-muted">{s.description}</p></td>
                      <td className="text-xs text-ink-muted">{(s.prerequisites ?? []).join(", ") || "—"}</td>
                      <td>{s.lessons}</td><td>{s.questions}</td>
                      <td className="whitespace-nowrap">
                        <button className="btn-ghost btn-sm" onClick={() => { setErrs({}); setEdit({ skill: s, isNew: false }); }}><Pencil className="h-3.5 w-3.5" /> Edit</button>
                        <button className="rounded p-1.5 text-ink-muted hover:text-danger disabled:opacity-30" disabled={s.lessons + s.questions > 0} title={s.lessons + s.questions > 0 ? "In use" : "Delete"} onClick={() => setDel(s)} aria-label={`Delete ${s.name}`}><Trash2 className="h-4 w-4" /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </div>
      {edit && (
        <Modal open onClose={() => setEdit(null)} title={edit.isNew ? "Add micro-skill" : `Edit ${edit.skill.code}`} footer={<><button className="btn-ghost" onClick={() => setEdit(null)}>Cancel</button><button className="btn-primary" onClick={save} disabled={pending}>{pending && <Spinner className="h-4 w-4" />}Save</button></>}>
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <TextInput label="Code" value={edit.skill.code} disabled={!edit.isNew} onChange={(e) => setEdit({ ...edit, skill: { ...edit.skill, code: e.target.value } })} error={errs.code} placeholder="R.SCAN" />
              <Select label="Category" value={edit.skill.category} disabled={!edit.isNew} onChange={(e) => setEdit({ ...edit, skill: { ...edit.skill, category: e.target.value as SkillCategory } })}>{SKILL_CATEGORIES.map((c) => <option key={c} value={c}>{SKILL_META[c].label}</option>)}</Select>
            </div>
            <TextInput label="Name" value={edit.skill.name} onChange={(e) => setEdit({ ...edit, skill: { ...edit.skill, name: e.target.value } })} error={errs.name} />
            <TextArea label="Description" value={edit.skill.description} onChange={(e) => setEdit({ ...edit, skill: { ...edit.skill, description: e.target.value } })} error={errs.description} />
            <fieldset>
              <legend className="label">Builds on (prerequisites)</legend>
              <div className="flex flex-wrap gap-1.5">
                {data.filter((s) => s.id !== edit.skill.id).map((s) => {
                  const on = (edit.skill.prerequisites ?? []).includes(s.id);
                  return <button type="button" key={s.id} aria-pressed={on} onClick={() => setEdit({ ...edit, skill: { ...edit.skill, prerequisites: on ? edit.skill.prerequisites!.filter((x) => x !== s.id) : [...(edit.skill.prerequisites ?? []), s.id] } })} className={on ? "rounded-full border border-navy bg-navy px-2.5 py-1 text-xs text-white" : "rounded-full border border-line px-2.5 py-1 text-xs"}>{s.code}</button>;
                })}
              </div>
            </fieldset>
          </div>
        </Modal>
      )}
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} danger title={`Delete ${del?.code}?`} confirmLabel="Delete" onConfirm={async () => { try { await adminApi.deleteSkill(del!.id); toast("Skill deleted."); setDel(null); reload(true); } catch (e) { toast((e as Error).message, "error"); } }} body="Learner mastery for this skill is removed too." />
    </div>
  );
}

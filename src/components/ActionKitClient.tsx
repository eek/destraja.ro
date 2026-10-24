'use client';

import React, { useState } from 'react';
import {
  Copy,
  Check,
  FileDown,
  ExternalLink,
  Mail,
  Pencil,
  UserCheck,
} from 'lucide-react';
import type { EnrichedBill, InstitutionalEmail } from '@/lib/types';
import { downloadPersonalizedDocx } from '@/lib/docx-client';
import { CLI_MODELS_META } from '@/lib/journalist-plain-data';

interface ActionKitClientProps {
  bill: EnrichedBill;
}

export default function ActionKitClient({ bill }: ActionKitClientProps) {
  const c = bill.analysis.consensus;

  // Active tab in the 60-second action kit
  const [activeTab, setActiveTab] = useState<'senat' | 'email' | 'share'>('senat');

  // Active AI model in the 3-AI Council switcher
  const [activeAi, setActiveAi] = useState<'agy' | 'claude' | 'codex'>('agy');

  // Editable form fields pre-populated with strict Senate limits
  const [articleRef, setArticleRef] = useState(c.senatForm.articleRef);
  const [proposalContent, setProposalContent] = useState(c.senatForm.proposalContent);
  const [argumentation, setArgumentation] = useState(c.senatForm.argumentation);
  const [otherComments, setOtherComments] = useState(c.senatForm.otherComments);
  const [editingField, setEditingField] = useState<string | null>(null);

  // Personalized DOCX fields
  const [citizenName, setCitizenName] = useState('');
  const [citizenRole, setCitizenRole] = useState('Cetățean și Contribuabil Român');
  const [isGeneratingDocx, setIsGeneratingDocx] = useState(false);

  // Copy feedback state
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const copyText = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      setTimeout(() => {
        setCopiedKey((prev) => (prev === key ? null : prev));
      }, 2000);
    } catch {
      // Fallback
    }
  };

  const handleCustomDocx = async () => {
    setIsGeneratingDocx(true);
    try {
      await downloadPersonalizedDocx(bill, citizenName, citizenRole);
    } finally {
      setIsGeneratingDocx(false);
    }
  };

  const emails: InstitutionalEmail[] =
    c.institutionalEmails && c.institutionalEmails.length > 0
      ? c.institutionalEmails
      : [
          {
            id: 'senat-general',
            targetName: 'Comisiile Raportoare ale Senatului României',
            badge: 'Procedură Parlamentară',
            to: ['juridica@senat.ro', 'infopub@senat.ro'],
            subject: `Punct de vedere și obiecții tehnice privind propunerea legislativă ${bill.id} (Cod Senat ${bill.cod})`,
            body: `Către: Biroul Permanent al Senatului României și Comisiile sesizate în fond\n\nSubiect: Punct de vedere privind ${bill.id} - ${bill.officialTitle}\n\nStimați Senatori,\n\nÎn temeiul Legii nr. 52/2003 privind transparența decizională, vă transmit următorul punct de vedere referitor la propunerea legislativă ${bill.id}:\n\n1. Articol vizat: ${articleRef}\n2. Propunere de modificare/respingere: ${proposalContent}\n3. Argumentare juridică și tehnică: ${argumentation}\n4. Observații suplimentare: ${otherComments}\n\nVă solicit înregistrarea oficială a acestui punct de vedere la dosarul legii (${bill.id}) și analizarea sa în ședința comisiilor raportoare.\n\nCu considerație,\n${citizenName.trim() || '[Numele Dvs.]'}\n${citizenRole}`,
            whyItMatters:
              'Obligă staff-ul tehnic al comisiilor din Senat să înregistreze obiecția la dosarul proiectului de lege.',
          },
        ];

  const defaultSocialPost =
    c.socialShare?.facebookPost ||
    `Atenție la proiectul de lege ${bill.id} aflat în consultare publică la Senat până pe ${bill.consultationDeadline}!\n\nCe spun inițiatorii: ${c.initiatorClaim}\n\nCe face legea în realitate (Scor risc AI: ${c.riskScore.toFixed(1)}/10): ${c.realityCheck}\n\nAm pregătit textele pre-calculate la fix pentru formularul Senatului + documentul Word (.docx) gata de atașat în 60 de secunde! Link în primul comentariu.`;

  const defaultFirstComment =
    c.socialShare?.firstCommentLinks ||
    `Linkuri oficiale pentru proiectul ${bill.id}:\n1. Fișa oficială pe Senat.ro: ${bill.sheetUrl}\n2. Portalul de consultare publică: https://www.senat.ro/LegiProiect.aspx\n3. Punctele de vedere deja depuse: ${bill.opinionsUrl}`;

  const formBoxes = [
    {
      id: 'articleRef',
      label: '1. Nr. articol la care se face referire',
      max: 50,
      value: articleRef,
      onChange: setArticleRef,
      multiline: false,
    },
    {
      id: 'proposalContent',
      label: '2. Conținut propunere',
      max: 400,
      value: proposalContent,
      onChange: setProposalContent,
      multiline: true,
    },
    {
      id: 'argumentation',
      label: '3. Argumentare',
      max: 400,
      value: argumentation,
      onChange: setArgumentation,
      multiline: true,
    },
    {
      id: 'otherComments',
      label: '4. Alte idei, sugestii, comentarii',
      max: 400,
      value: otherComments,
      onChange: setOtherComments,
      multiline: true,
    },
  ];

  const currentModel = bill.analysis.council[activeAi];

  return (
    <div className="space-y-12">
      {/* 1. 60-SECOND CIVIC ACTION KIT (Clean Tabbed Architecture, Zero Clutter) */}
      <section
        id="kit-actiune"
        className="rounded-2xl bg-[var(--surface-card)] border border-[var(--border-subtle)] overflow-hidden scroll-mt-20"
      >
        {/* Kit Header */}
        <div className="p-5 sm:p-6 border-b border-[var(--border-subtle)] space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-xl sm:text-2xl font-bold">
                Acționează în 60 de secunde ({bill.id})
              </h2>
              <p className="text-sm text-[var(--text-secondary)] mt-0.5">
                Texte pre-dimensionate la limitele formularului Senat.ro (50 și 400 caractere) + document Word și sesizări oficiale.
              </p>
            </div>

            <a
              href="https://www.senat.ro/LegiProiect.aspx"
              target="_blank"
              rel="noopener noreferrer"
              className="touch-target inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold text-sm shrink-0 transition-colors"
            >
              <span>Deschide Formularul Senat.ro</span>
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>

          {/* 3-Tab Switcher */}
          <div
            role="tablist"
            aria-label="Canale de acțiune civică"
            className="grid grid-cols-3 bg-[var(--surface-elevated)] p-1 rounded-xl border border-[var(--border-subtle)] text-xs sm:text-sm font-medium"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'senat'}
              onClick={() => setActiveTab('senat')}
              className={`touch-target py-2 px-2.5 rounded-lg transition-colors cursor-pointer ${
                activeTab === 'senat'
                  ? 'bg-[var(--surface-card)] text-[var(--text-primary)] font-semibold shadow-xs'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              1. Formular Senat
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'email'}
              onClick={() => setActiveTab('email')}
              className={`touch-target py-2 px-2.5 rounded-lg transition-colors cursor-pointer ${
                activeTab === 'email'
                  ? 'bg-[var(--surface-card)] text-[var(--text-primary)] font-semibold shadow-xs'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              2. Email Instituții ({emails.length})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'share'}
              onClick={() => setActiveTab('share')}
              className={`touch-target py-2 px-2.5 rounded-lg transition-colors cursor-pointer ${
                activeTab === 'share'
                  ? 'bg-[var(--surface-card)] text-[var(--text-primary)] font-semibold shadow-xs'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              3. Distribuie
            </button>
          </div>
        </div>

        {/* TAB 1: SENAT.RO FORM + DOCX */}
        {activeTab === 'senat' && (
          <div className="divide-y divide-[var(--border-subtle)]">
            {/* DOCX Row */}
            <div className="p-4 sm:p-6 bg-[var(--surface-elevated)]/40 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <div className="font-semibold text-sm sm:text-base">
                    Memoriu tehnic-juridic complet (.docx) pentru butonul „Adaugă fișiere”
                  </div>
                  <p className="text-xs text-[var(--text-muted)]">
                    Conține argumentația detaliată care nu încape în limita de 400 de caractere a formularului web.
                  </p>
                </div>

                <a
                  href={`/docs/Punct_de_vedere_${bill.slug.toUpperCase()}.docx`}
                  download
                  className="touch-target inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--text-primary)] text-[var(--surface-canvas)] font-semibold text-xs sm:text-sm shrink-0 transition-opacity hover:opacity-90"
                >
                  <FileDown className="w-4 h-4" />
                  <span>Descarcă Punct_de_vedere.docx</span>
                </a>
              </div>

              {/* Optional Name Personalization tucked cleanly in a native <details> */}
              <details className="group pt-1">
                <summary className="text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer inline-flex items-center gap-1.5">
                  <UserCheck className="w-3.5 h-3.5" />
                  <span>Opțional: Personalizează documentul .docx cu numele tău</span>
                </summary>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-3">
                  <input
                    type="text"
                    value={citizenName}
                    onChange={(e) => setCitizenName(e.target.value)}
                    placeholder="Numele tău (ex: Popescu Andrei)"
                    className="touch-target px-3 py-2 rounded-xl bg-[var(--surface-card)] border border-[var(--border-subtle)] text-base sm:text-xs"
                  />
                  <input
                    type="text"
                    value={citizenRole}
                    onChange={(e) => setCitizenRole(e.target.value)}
                    placeholder="Calitatea (ex: Cetățean / Inginer IT)"
                    className="touch-target px-3 py-2 rounded-xl bg-[var(--surface-card)] border border-[var(--border-subtle)] text-base sm:text-xs"
                  />
                  <button
                    type="button"
                    onClick={handleCustomDocx}
                    disabled={isGeneratingDocx}
                    className="touch-target inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold text-xs cursor-pointer"
                  >
                    <FileDown className="w-3.5 h-3.5" />
                    <span>
                      {isGeneratingDocx ? 'Se generează...' : 'Descarcă .docx semnat'}
                    </span>
                  </button>
                </div>
              </details>
            </div>

            {/* The 4 Copyable Fields as Clean Divided Rows */}
            {formBoxes.map((box) => {
              const isOver = box.value.length > box.max;
              const isCopied = copiedKey === box.id;
              const isEditing = editingField === box.id;

              return (
                <div key={box.id} className="p-4 sm:p-6 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm">{box.label}</span>
                      <span
                        className={`text-xs font-mono tabular-nums px-1.5 py-0.5 rounded ${
                          isOver
                            ? 'bg-red-600 text-white font-bold'
                            : 'text-[var(--text-muted)] bg-[var(--surface-elevated)]'
                        }`}
                      >
                        {box.value.length}/{box.max}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => setEditingField(isEditing ? null : box.id)}
                        className="touch-target px-2.5 py-1.5 rounded-lg text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-elevated)] inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Pencil className="w-3 h-3" />
                        <span>{isEditing ? 'Gata' : 'Editează'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => copyText(box.id, box.value)}
                        className={`touch-target inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                          isCopied
                            ? 'bg-emerald-600 text-white'
                            : 'bg-[var(--surface-elevated)] hover:bg-red-600 hover:text-white text-[var(--text-primary)]'
                        }`}
                      >
                        {isCopied ? (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            <span>Copiat</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>Copiază</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {isEditing ? (
                    box.multiline ? (
                      <textarea
                        rows={3}
                        value={box.value}
                        onChange={(e) => box.onChange(e.target.value)}
                        className="w-full p-3 rounded-xl bg-[var(--surface-elevated)] border border-[var(--border-subtle)] text-base sm:text-sm leading-relaxed"
                      />
                    ) : (
                      <input
                        type="text"
                        value={box.value}
                        onChange={(e) => box.onChange(e.target.value)}
                        className="w-full p-3 rounded-xl bg-[var(--surface-elevated)] border border-[var(--border-subtle)] text-base sm:text-sm"
                      />
                    )
                  ) : (
                    <p className="text-[15px] text-[var(--text-secondary)] prose-measure leading-relaxed select-all">
                      {box.value}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* TAB 2: INSTITUTIONAL EMAILS */}
        {activeTab === 'email' && (
          <div className="divide-y divide-[var(--border-subtle)]">
            {emails.map((em) => {
              const mailtoHref = `mailto:${em.to.join(',')}?${
                em.cc && em.cc.length > 0 ? `cc=${encodeURIComponent(em.cc.join(','))}&` : ''
              }subject=${encodeURIComponent(em.subject)}&body=${encodeURIComponent(em.body)}`;

              return (
                <div key={em.id} className="p-4 sm:p-6 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-bold text-base">{em.targetName}</h3>
                        <span className="text-xs px-2 py-0.5 rounded bg-[var(--surface-elevated)] text-[var(--text-secondary)] font-medium">
                          {em.badge}
                        </span>
                      </div>
                      <p className="text-sm text-[var(--text-secondary)] prose-measure">
                        {em.whyItMatters}
                      </p>
                      <div className="text-xs font-mono text-[var(--text-muted)] pt-0.5">
                        Către: {em.to.join(', ')}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <a
                        href={mailtoHref}
                        className="touch-target inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold text-xs transition-colors"
                      >
                        <Mail className="w-3.5 h-3.5" />
                        <span>Deschide în Email</span>
                      </a>
                      <button
                        type="button"
                        onClick={() => copyText(`body-${em.id}`, em.body)}
                        className="touch-target inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-[var(--surface-elevated)] hover:bg-[var(--border-subtle)] text-xs font-semibold cursor-pointer"
                      >
                        {copiedKey === `body-${em.id}` ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-500" />
                            <span>Corp copiat</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>Copiază textul</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  <details className="group">
                    <summary className="text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer">
                      Afișează subiectul și textul complet al sesizării ↓
                    </summary>
                    <div className="mt-2.5 p-3.5 rounded-xl bg-[var(--surface-elevated)] border border-[var(--border-subtle)] space-y-2 text-xs">
                      <div className="flex items-center justify-between gap-2 pb-2 border-b border-[var(--border-subtle)]">
                        <span className="font-semibold">Subiect: {em.subject}</span>
                        <button
                          type="button"
                          onClick={() => copyText(`subj-${em.id}`, em.subject)}
                          className="underline font-semibold shrink-0 cursor-pointer"
                        >
                          {copiedKey === `subj-${em.id}` ? 'Copiat' : 'Copiază subiect'}
                        </button>
                      </div>
                      <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed max-h-60 overflow-y-auto">
                        {em.body}
                      </pre>
                    </div>
                  </details>
                </div>
              );
            })}
          </div>
        )}

        {/* TAB 3: SOCIAL SHARE */}
        {activeTab === 'share' && (
          <div className="divide-y divide-[var(--border-subtle)]">
            <div className="p-4 sm:p-6 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="font-semibold text-sm">
                    1. Postarea principală (fără linkuri externe, pentru vizibilitate maximă)
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => copyText('social-post', defaultSocialPost)}
                  className="touch-target inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[var(--surface-elevated)] hover:bg-red-600 hover:text-white text-xs font-semibold transition-colors cursor-pointer shrink-0"
                >
                  {copiedKey === 'social-post' ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Copiat</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copiază postarea</span>
                    </>
                  )}
                </button>
              </div>
              <pre className="whitespace-pre-wrap font-sans text-sm text-[var(--text-secondary)] prose-measure leading-relaxed bg-[var(--surface-elevated)] p-3.5 rounded-xl">
                {defaultSocialPost}
              </pre>
            </div>

            <div className="p-4 sm:p-6 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="font-semibold text-sm">
                    2. Primul comentariu (cu linkurile directe către Senat.ro)
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => copyText('social-comment', defaultFirstComment)}
                  className="touch-target inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[var(--surface-elevated)] hover:bg-red-600 hover:text-white text-xs font-semibold transition-colors cursor-pointer shrink-0"
                >
                  {copiedKey === 'social-comment' ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Copiat</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copiază comentariul</span>
                    </>
                  )}
                </button>
              </div>
              <pre className="whitespace-pre-wrap font-sans text-sm text-[var(--text-secondary)] prose-measure leading-relaxed bg-[var(--surface-elevated)] p-3.5 rounded-xl">
                {defaultFirstComment}
              </pre>
            </div>
          </div>
        )}
      </section>

      {/* 2. 3-AI COUNCIL AUDIT (Clean Segmented Switcher — No 3-screen mobile stack) */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold">
              Auditul AI (Gemini + Claude + ChatGPT)
            </h2>
            <p className="text-sm text-[var(--text-secondary)]">
              Fiecare model a analizat independent textul legii și expunerea de motive. Selectează un model pentru a-i citi concluziile.
            </p>
          </div>
          <span className="text-xs font-mono text-[var(--text-muted)] tabular-nums">
            Consens: {c.riskScore.toFixed(1)} / 10
          </span>
        </div>

        <div className="rounded-2xl bg-[var(--surface-card)] border border-[var(--border-subtle)] overflow-hidden">
          {/* Model Selector Bar */}
          <div
            role="tablist"
            aria-label="Modele AI"
            className="grid grid-cols-3 border-b border-[var(--border-subtle)] bg-[var(--surface-elevated)]/60 text-xs sm:text-sm"
          >
            {(['agy', 'claude', 'codex'] as const).map((key) => {
              const m = bill.analysis.council[key];
              const meta = CLI_MODELS_META[key];
              const selected = activeAi === key;
              return (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setActiveAi(key)}
                  className={`touch-target p-3 sm:p-4 text-left border-b-2 transition-colors cursor-pointer ${
                    selected
                      ? 'border-red-600 bg-[var(--surface-card)] font-semibold'
                      : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-mono font-bold">{meta.shortLabel}</span>
                    <span className="font-mono tabular-nums text-xs px-1.5 py-0.5 rounded bg-[var(--surface-elevated)] text-[var(--text-primary)]">
                      {m.riskScore.toFixed(1)}
                    </span>
                  </div>
                  <div className="text-[11px] text-[var(--text-muted)] truncate mt-0.5 hidden sm:block">
                    {meta.fullModel}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Active Model Report */}
          <div className="p-5 sm:p-6 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[var(--border-subtle)]">
              <div>
                <div className="font-bold text-base">
                  {CLI_MODELS_META[activeAi].fullModel}
                </div>
                <div className="text-xs text-[var(--text-muted)]">
                  {CLI_MODELS_META[activeAi].role}
                </div>
              </div>
              <span className="font-mono font-bold text-sm tabular-nums">
                Scor risc: {currentModel.riskScore.toFixed(1)} / 10
              </span>
            </div>

            <p className="text-base font-semibold leading-snug prose-measure">
              {currentModel.verdictShort}
            </p>

            <div className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                Ce a identificat în PDF-ul oficial
              </div>
              <ul className="space-y-2 text-[15px] text-[var(--text-secondary)] prose-measure">
                {currentModel.keyFindings.map((kf, i) => (
                  <li key={i} className="flex items-start gap-2.5">
                    <span className="text-red-600 dark:text-red-400 font-bold mt-0.5">•</span>
                    <span>{kf}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-[var(--border-subtle)] text-sm">
              <div className="space-y-1">
                <div className="font-semibold text-xs text-red-700 dark:text-red-400">
                  Capcană ascunsă sesizată
                </div>
                <p className="text-[var(--text-secondary)] text-xs sm:text-sm leading-relaxed">
                  {currentModel.blindSpotsCaught}
                </p>
              </div>

              <div className="space-y-1">
                <div className="font-semibold text-xs text-[var(--text-primary)]">
                  Notă de constituționalitate
                </div>
                <p className="text-[var(--text-secondary)] text-xs sm:text-sm leading-relaxed">
                  {currentModel.constitutionalityNote}
                </p>
              </div>

              <div className="space-y-1">
                <div className="font-semibold text-xs text-[var(--text-primary)]">
                  Drept UE & proporționalitate
                </div>
                <p className="text-[var(--text-secondary)] text-xs sm:text-sm leading-relaxed">
                  {currentModel.euLawNote}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

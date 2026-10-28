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
import { MODELS } from '@/lib/site';
import { fmt } from '@/lib/format';
import { trackAttrs } from '@/lib/analytics';
import ReportIssue from '@/components/bills/ReportIssue';

interface ActionKitClientProps {
  bill: EnrichedBill;
  // Secțiunea „În presă”, randată pe server: stă între kit și auditul AI.
  press?: React.ReactNode;
}

export default function ActionKitClient({ bill, press }: ActionKitClientProps) {
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
      // docx e o bibliotecă mare; o încărcăm doar când cineva chiar cere documentul.
      const { downloadPersonalizedDocx } = await import('@/lib/docx-client');
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
            // Adresele de pe senat.ro (data/senat/comisii.json); juridica@senat.ro întorcea 550 (issue #2).
            to: ['com.juridica@senat.ro', 'infopub@senat.ro'],
            subject: `Punct de vedere privind propunerea legislativă ${bill.id} (Cod Senat ${bill.cod})`,
            body: `Către: Biroul Permanent al Senatului României și Comisiile sesizate în fond\n\nSubiect: Punct de vedere privind ${bill.id} - ${bill.officialTitle}\n\nStimați Senatori,\n\nÎn cadrul consultării publice organizate de Senat pentru propunerea legislativă ${bill.id} și în exercitarea dreptului de petiționare prevăzut de art. 51 din Constituție, vă transmit următorul punct de vedere:\n\n1. Articol vizat: ${articleRef}\n2. Conținutul propunerii: ${proposalContent}\n3. Argumentare juridică și tehnică: ${argumentation}\n4. Observații suplimentare: ${otherComments}\n\nVă rog să înregistrați acest punct de vedere la dosarul propunerii legislative ${bill.id} și să-l transmiteți inițiatorilor și comisiilor sesizate.\n\nCu considerație,\n${citizenName.trim() || '[Numele Dvs.]'}\n${citizenRole}`,
            whyItMatters:
              // Senatul cere formularul ca opinia să fie luată în considerare (senat.ro/LegiProiect.aspx); e-mailul o completează.
              'Ajunge direct la Comisia juridică și la registratura Senatului. Ca opinia să fie luată în considerare, Senatul cere și formularul de la pasul 1.',
          },
        ];

  const defaultSocialPost =
    c.socialShare?.facebookPost ||
    `${
      c.riskLevel === 'red'
        ? `Atenție la proiectul de lege ${bill.id} aflat în consultare publică la Senat până pe ${bill.consultationDeadline}!`
        : `Proiectul de lege ${bill.id} e în consultare publică la Senat până pe ${bill.consultationDeadline}.`
    }\n\nCe spun inițiatorii: ${c.initiatorClaim}\n\nCe face legea în realitate (Scor risc AI: ${fmt(c.riskScore)}/10): ${c.realityCheck}\n\nAm pregătit textele pre-calculate la fix pentru formularul Senatului + documentul Word (.docx) gata de atașat în 60 de secunde! Link în primul comentariu.`;

  const defaultFirstComment =
    c.socialShare?.firstCommentLinks ||
    `Linkuri oficiale pentru proiectul ${bill.id}:\n1. Fișa oficială pe Senat.ro: ${bill.sheetUrl}\n2. Portalul de consultare publică: https://www.senat.ro/LegiProiect.aspx\n3. Punctele de vedere deja depuse: ${bill.opinionsUrl}`;

  const formBoxes = [
    {
      id: 'articleRef',
      field: 'article',
      label: '1. Nr. articol la care se face referire',
      max: 50,
      value: articleRef,
      onChange: setArticleRef,
      multiline: false,
    },
    {
      id: 'proposalContent',
      field: 'proposal',
      label: '2. Conținut propunere',
      max: 400,
      value: proposalContent,
      onChange: setProposalContent,
      multiline: true,
    },
    {
      id: 'argumentation',
      field: 'argument',
      label: '3. Argumentare',
      max: 400,
      value: argumentation,
      onChange: setArgumentation,
      multiline: true,
    },
    {
      id: 'otherComments',
      field: 'comments',
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
        className="rounded-2xl bg-surface border border-line overflow-hidden scroll-mt-20"
      >
        {/* Kit Header */}
        <div className="p-5 sm:p-6 border-b border-line space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-2xl sm:text-3xl font-normal">
                Acționează în 60 de secunde ({bill.id})
              </h2>
              <p className="text-sm text-body mt-0.5">
                Texte pre-dimensionate la limitele formularului Senat.ro (50 și 400 caractere) + document Word și sesizări oficiale.
              </p>
            </div>

            <a
              href="https://www.senat.ro/LegiProiect.aspx"
              target="_blank"
              rel="noopener noreferrer"
              {...trackAttrs('senat_form_open', { bill_id: bill.id })}
              className="touch-target inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-brand hover:bg-brand-hover text-on-brand font-semibold text-sm shrink-0 transition-colors"
            >
              <span>Deschide Formularul Senat.ro</span>
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>

          {/* 3-Tab Switcher */}
          <div
            role="tablist"
            aria-label="Canale de acțiune civică"
            className="grid grid-cols-3 bg-sunken p-1 rounded-xl border border-line text-xs sm:text-sm font-medium"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'senat'}
              onClick={() => setActiveTab('senat')}
              {...trackAttrs('kit_tab', { bill_id: bill.id, tab: 'senat' })}
              className={`touch-target py-2 px-2.5 rounded-lg transition-colors cursor-pointer ${
                activeTab === 'senat'
                  ? 'bg-surface text-ink font-semibold'
                  : 'text-muted hover:text-ink'
              }`}
            >
              1. Formular Senat
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'email'}
              onClick={() => setActiveTab('email')}
              {...trackAttrs('kit_tab', { bill_id: bill.id, tab: 'email' })}
              className={`touch-target py-2 px-2.5 rounded-lg transition-colors cursor-pointer ${
                activeTab === 'email'
                  ? 'bg-surface text-ink font-semibold'
                  : 'text-muted hover:text-ink'
              }`}
            >
              2. Email Instituții ({emails.length})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'share'}
              onClick={() => setActiveTab('share')}
              {...trackAttrs('kit_tab', { bill_id: bill.id, tab: 'share' })}
              className={`touch-target py-2 px-2.5 rounded-lg transition-colors cursor-pointer ${
                activeTab === 'share'
                  ? 'bg-surface text-ink font-semibold'
                  : 'text-muted hover:text-ink'
              }`}
            >
              3. Distribuie
            </button>
          </div>
        </div>

        {/* TAB 1: SENAT.RO FORM + DOCX */}
        {activeTab === 'senat' && (
          <div className="divide-y divide-line">
            {/* DOCX Row */}
            <div className="p-4 sm:p-6 bg-sunken/50 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <div className="font-semibold text-sm sm:text-base">
                    Memoriu tehnic-juridic complet (.docx) pentru butonul „Adaugă fișiere”
                  </div>
                  <p className="text-xs text-muted">
                    Conține argumentația detaliată care nu încape în limita de 400 de caractere a formularului web.
                  </p>
                </div>

                <a
                  href={`/docs/Punct_de_vedere_${bill.slug.toUpperCase()}.docx`}
                  download
                  {...trackAttrs('docx_download', { bill_id: bill.id, personalized: 'no', source: 'kit' })}
                  className="touch-target inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-brand text-on-brand font-semibold text-xs sm:text-sm shrink-0 transition-opacity hover:opacity-90"
                >
                  <FileDown className="w-4 h-4" />
                  <span>Descarcă Punct_de_vedere.docx</span>
                </a>
              </div>

              {/* Optional Name Personalization tucked cleanly in a native <details> */}
              <details className="group pt-1">
                <summary className="text-xs font-semibold text-body hover:text-ink cursor-pointer inline-flex items-center gap-1.5">
                  <UserCheck className="w-3.5 h-3.5" />
                  <span>Opțional: Personalizează documentul .docx cu numele tău</span>
                </summary>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-3">
                  <input
                    type="text"
                    value={citizenName}
                    onChange={(e) => setCitizenName(e.target.value)}
                    placeholder="Numele tău (ex: Popescu Andrei)"
                    className="touch-target px-3 py-2 rounded-xl bg-surface border border-line text-base sm:text-xs"
                  />
                  <input
                    type="text"
                    value={citizenRole}
                    onChange={(e) => setCitizenRole(e.target.value)}
                    placeholder="Calitatea (ex: Cetățean / Inginer IT)"
                    className="touch-target px-3 py-2 rounded-xl bg-surface border border-line text-base sm:text-xs"
                  />
                  <button
                    type="button"
                    onClick={handleCustomDocx}
                    {...trackAttrs('docx_download', { bill_id: bill.id, personalized: 'yes', source: 'kit' })}
                    disabled={isGeneratingDocx}
                    className="touch-target inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-brand hover:bg-brand-hover text-on-brand font-semibold text-xs cursor-pointer"
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
                            ? 'bg-ink text-paper font-semibold'
                            : 'text-muted bg-sunken'
                        }`}
                      >
                        {box.value.length}/{box.max}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => setEditingField(isEditing ? null : box.id)}
                        className="touch-target px-2.5 py-1.5 rounded-lg text-xs text-muted hover:text-ink hover:bg-sunken inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Pencil className="w-3 h-3" />
                        <span>{isEditing ? 'Gata' : 'Editează'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => copyText(box.id, box.value)}
                        {...trackAttrs('text_copy', {
                          bill_id: bill.id,
                          field: box.field,
                          edited: box.value === c.senatForm[box.id as keyof typeof c.senatForm] ? 'no' : 'yes',
                        })}
                        className={`touch-target inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                          isCopied
                            ? 'bg-brand-soft text-ink'
                            : 'bg-sunken hover:bg-brand hover:text-on-brand text-ink'
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
                        className="w-full p-3 rounded-xl bg-sunken border border-line text-base sm:text-sm leading-relaxed"
                      />
                    ) : (
                      <input
                        type="text"
                        value={box.value}
                        onChange={(e) => box.onChange(e.target.value)}
                        className="w-full p-3 rounded-xl bg-sunken border border-line text-base sm:text-sm"
                      />
                    )
                  ) : (
                    <p className="text-[15px] text-body prose-measure leading-relaxed select-all">
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
          <div className="divide-y divide-line">
            {emails.map((em) => {
              const mailtoHref = `mailto:${em.to.join(',')}?${
                em.cc && em.cc.length > 0 ? `cc=${encodeURIComponent(em.cc.join(','))}&` : ''
              }subject=${encodeURIComponent(em.subject)}&body=${encodeURIComponent(em.body)}`;

              return (
                <div key={em.id} className="p-4 sm:p-6 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold text-base">{em.targetName}</h3>
                        <span className="text-xs px-2 py-0.5 rounded bg-sunken text-body font-medium">
                          {em.badge}
                        </span>
                      </div>
                      <p className="text-sm text-body prose-measure">
                        {em.whyItMatters}
                      </p>
                      <div className="text-xs font-mono text-muted pt-0.5">
                        Către: {em.to.join(', ')}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <a
                        href={mailtoHref}
                        {...trackAttrs('email_open', { bill_id: bill.id, institution: em.id })}
                        className="touch-target inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-brand hover:bg-brand-hover text-on-brand font-semibold text-xs transition-colors"
                      >
                        <Mail className="w-3.5 h-3.5" />
                        <span>Deschide în Email</span>
                      </a>
                      <button
                        type="button"
                        onClick={() => copyText(`body-${em.id}`, em.body)}
                        {...trackAttrs('text_copy', { bill_id: bill.id, field: 'email_body', institution: em.id })}
                        className="touch-target inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-sunken hover:bg-line text-xs font-semibold cursor-pointer"
                      >
                        {copiedKey === `body-${em.id}` ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-link" />
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
                    <summary className="text-xs font-medium text-muted hover:text-ink cursor-pointer">
                      Afișează subiectul și textul complet al sesizării ↓
                    </summary>
                    <div className="mt-2.5 p-3.5 rounded-xl bg-sunken border border-line space-y-2 text-xs">
                      <div className="flex items-center justify-between gap-2 pb-2 border-b border-line">
                        <span className="font-semibold">Subiect: {em.subject}</span>
                        <button
                          type="button"
                          onClick={() => copyText(`subj-${em.id}`, em.subject)}
                          {...trackAttrs('text_copy', { bill_id: bill.id, field: 'email_subject', institution: em.id })}
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
          <div className="divide-y divide-line">
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
                  {...trackAttrs('text_copy', { bill_id: bill.id, field: 'social_post' })}
                  className="touch-target inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-sunken hover:bg-brand hover:text-on-brand text-xs font-semibold transition-colors cursor-pointer shrink-0"
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
              <pre className="whitespace-pre-wrap font-sans text-sm text-body prose-measure leading-relaxed bg-sunken p-3.5 rounded-xl">
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
                  {...trackAttrs('text_copy', { bill_id: bill.id, field: 'social_comment' })}
                  className="touch-target inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-sunken hover:bg-brand hover:text-on-brand text-xs font-semibold transition-colors cursor-pointer shrink-0"
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
              <pre className="whitespace-pre-wrap font-sans text-sm text-body prose-measure leading-relaxed bg-sunken p-3.5 rounded-xl">
                {defaultFirstComment}
              </pre>
            </div>
          </div>
        )}
      </section>

      {press}

      {/* 2. 3-AI COUNCIL AUDIT (Clean Segmented Switcher — No 3-screen mobile stack) */}
      <section id="audit-ai" className="scroll-mt-24 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
          <div>
            <h2 className="font-display text-2xl sm:text-3xl font-normal">
              Auditul AI (Gemini + Claude + ChatGPT)
            </h2>
            <p className="text-sm text-body">
              Fiecare model a analizat independent textul legii și expunerea de motive. Selectează un model pentru a-i citi concluziile.
            </p>
          </div>
          <span className="text-xs font-mono text-muted tabular-nums">
            Consens: {fmt(c.riskScore)}/10
          </span>
        </div>

        <div className="rounded-2xl bg-surface border border-line overflow-hidden">
          {/* Model Selector Bar */}
          <div
            role="tablist"
            aria-label="Modele AI"
            className="grid grid-cols-3 border-b border-line bg-sunken/70 text-xs sm:text-sm"
          >
            {(['agy', 'claude', 'codex'] as const).map((key) => {
              const m = bill.analysis.council[key];
              const meta = MODELS.find((x) => x.key === key)!;
              const selected = activeAi === key;
              return (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setActiveAi(key)}
                  {...trackAttrs('ai_model_view', { bill_id: bill.id, model: key })}
                  className={`touch-target p-3 sm:p-4 text-left border-b-2 transition-colors cursor-pointer ${
                    selected
                      ? 'border-brand bg-surface font-semibold'
                      : 'border-transparent text-muted hover:text-ink'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-semibold">{meta.name}</span>
                    <span className="tabular-nums text-xs px-1.5 py-0.5 rounded bg-sunken text-ink">
                      {fmt(m.riskScore)}
                    </span>
                  </div>
                  <div className="text-[11px] text-muted truncate mt-0.5 hidden sm:block">
                    {meta.fullName}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Active Model Report */}
          <div className="p-5 sm:p-6 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-line">
              <div>
                <div className="font-semibold text-base">
                  {MODELS.find((x) => x.key === activeAi)!.fullName}
                </div>
                <div className="text-xs text-muted">
                  {MODELS.find((x) => x.key === activeAi)!.role}
                </div>
              </div>
              <span className="font-semibold text-sm tabular-nums">
                Scor risc: {fmt(currentModel.riskScore)} / 10
              </span>
            </div>

            <p className="text-base font-semibold leading-snug prose-measure">
              {currentModel.verdictShort}
            </p>

            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-ink">
                Ce a găsit în textul oficial
              </h3>
              <ul className="space-y-2 text-[15px] text-body prose-measure">
                {currentModel.keyFindings.map((kf, i) => (
                  <li key={i} className="flex items-start gap-2.5">
                    <span aria-hidden className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-muted" />
                    <span>{kf}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-line text-sm">
              <div className="space-y-1">
                <div className="font-semibold text-xs text-ink">
                  Capcană ascunsă sesizată
                </div>
                <p className="text-body text-xs sm:text-sm leading-relaxed">
                  {currentModel.blindSpotsCaught}
                </p>
              </div>

              <div className="space-y-1">
                <div className="font-semibold text-xs text-ink">
                  Notă de constituționalitate
                </div>
                <p className="text-body text-xs sm:text-sm leading-relaxed">
                  {currentModel.constitutionalityNote}
                </p>
              </div>

              <div className="space-y-1">
                <div className="font-semibold text-xs text-ink">
                  Drept UE & proporționalitate
                </div>
                <p className="text-body text-xs sm:text-sm leading-relaxed">
                  {currentModel.euLawNote}
                </p>
              </div>
            </div>
          </div>
        </div>

        <ReportIssue billId={bill.id} target={activeAi} />
      </section>
    </div>
  );
}

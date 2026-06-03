/* =============================================================================
   SmileVirtual — personalized video script generator
   -----------------------------------------------------------------------------
   Turns a lead's intake (goals, free-text, question answers, sim) into a ready
   teleprompter draft so the doctor RIFFS instead of COMPOSES. This is the single
   biggest lever on time-to-send.

   Demo note: this is deterministic, template-based composition — no network. In
   production this is one Claude API call ("draft a warm 60–90s personalized
   consult script from this intake"); the rest of the workspace is unchanged.
   ============================================================================= */
(function (global) {
  'use strict';

  // goal -> the clinical option a dentist would typically mention
  const GOAL_TALK = {
    'Whiter teeth':       'professional whitening — and we can preview a few shade levels so it still looks natural',
    'Straighter teeth':   'clear aligners like Invisalign, which would be a great fit for what I’m seeing',
    'Close gaps':         'either bonding for a quick fix or veneers for a more permanent result — I’ll walk through both',
    'Fix chips & cracks': 'bonding or a couple of veneers to rebuild that edge so it looks like nothing ever happened',
    'Full makeover':      'a smile-design plan — likely a set of veneers — where we map the whole look together',
    'Not sure yet':       'a few directions, no pressure — I’ll lay out the simplest options first'
  };

  function firstName(lead) { return (lead.contact && lead.contact.firstName) || 'there'; }

  function goalSentence(lead) {
    const goals = lead.goals || [];
    if (!goals.length && lead.goalText) {
      return `You mentioned you’d love to ${trimText(lead.goalText)} — and I can absolutely help with that.`;
    }
    if (!goals.length) return `Thanks for sending your photos over.`;
    const named = goals.slice(0, 2).join(' and ').toLowerCase();
    return `I saw you’re looking to work on ${named} — that’s a really common goal and a fun one to plan.`;
  }

  function optionsParagraph(lead) {
    const goals = (lead.goals && lead.goals.length) ? lead.goals : ['Not sure yet'];
    const bits = goals.map(g => GOAL_TALK[g]).filter(Boolean).slice(0, 2);
    if (!bits.length) return '';
    return `Looking at your photos, here’s what I’d suggest: ${bits.join('; and ')}.`;
  }

  function timelineLine(lead) {
    const ans = lead.questionAnswers || {};
    const when = ans[2] || ans['2'];
    if (!when) return '';
    if (/as soon/i.test(when)) return `Since you’re ready to get going, I’ll have my team hold a couple of times for you.`;
    if (/1–3|1-3/.test(when)) return `You mentioned the next month or two — that’s plenty of runway to do this right.`;
    if (/exploring/i.test(when)) return `No rush at all — this is just so you can see what’s possible whenever you’re ready.`;
    return '';
  }

  function concernLine(lead) {
    const ans = lead.questionAnswers || {};
    const concern = ans[0] || ans['0'];
    if (!concern) return '';
    return `And I heard you on this: “${trimText(concern)}.” That’s exactly the kind of thing we fix every week.`;
  }

  function trimText(t, n = 90) { t = (t || '').trim(); return t.length > n ? t.slice(0, n) + '…' : t; }

  /* returns { lines: [{cue, text}], plain } */
  function generate(lead, cfg) {
    const doc = (cfg && cfg.doctor && cfg.doctor.name) || 'Dr. Harris';
    const name = firstName(lead);
    const lines = [];

    lines.push({ cue: 'Warm open', text: `Hey ${name}, it’s ${doc} — thanks so much for sharing your smile with me.` });
    lines.push({ cue: 'Reflect their goal', text: goalSentence(lead) });

    const concern = concernLine(lead); if (concern) lines.push({ cue: 'Acknowledge concern', text: concern });

    const opts = optionsParagraph(lead); if (opts) lines.push({ cue: 'Your recommendation', text: opts });

    if (lead.sim && lead.sim.enabled) {
      lines.push({ cue: 'Tie to the preview', text: `That preview you unlocked is a great starting point — let me show you on your own photo what’s realistic and what I’d tweak.` });
    }

    const timeline = timelineLine(lead); if (timeline) lines.push({ cue: 'Match their timeline', text: timeline });

    lines.push({ cue: 'Clear next step', text: `If you love where this is headed, the easiest next step is a quick visit so we can confirm the plan — tap the “Book my visit” button right under this video and grab a time that works.` });
    lines.push({ cue: 'Warm close', text: `Either way, no pressure at all. Really looking forward to helping you love your smile, ${name}.` });

    return {
      lines,
      plain: lines.map(l => l.text).join('\n\n')
    };
  }

  global.ScriptGen = { generate };
})(window);

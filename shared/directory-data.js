/* =============================================================================
   Virtual Consult — directory data
   -----------------------------------------------------------------------------
   The doctor network behind the directory surface.

   REAL, VERIFIABLE fields (pulled from the CMS NPPES NPI registry):
     name, npi, credential/specialty, city. These power the "NPI-verified" badge
     — in production a server re-checks each NPI against NPPES on a schedule.
   DEMO fields (synthesized for the prototype, NOT from NPPES):
     rating, reviews, responseHrs, goals offered, financingFrom, beforeAfters,
     bio, accent. NPPES does not hold clinical/marketing data.

   Dr. Brian Harris is our fictional "featured" provider — the one wired to the
   practice console, so his response-time badge is computed live from Store.
   ============================================================================= */
(function (global) {
  'use strict';

  // approximate city centroids (lat,lng) for distance + map placement
  const CITY = {
    'Trabuco Canyon': [33.6701, -117.6371],   // default searcher location (Crisalix example)
    'Newport Beach':  [33.6189, -117.9298],
    'Costa Mesa':     [33.6411, -117.9187],
    'Irvine':         [33.6846, -117.8265],
    'Mission Viejo':  [33.6000, -117.6719],
    'Rancho Santa Margarita': [33.6406, -117.6031],
    'Fountain Valley':[33.7092, -117.9537],
    'Tustin':         [33.7458, -117.8261]
  };

  // the goals a patient can filter on (mirrors the patient flow's goals)
  const GOALS = ['Whitening','Veneers','Clear aligners','Close gaps','Chips & cracks','Full makeover','Implants'];

  const titleCase = s => s.toLowerCase().replace(/\b\w/g,c=>c.toUpperCase());

  /* ---- the network ---- */
  const DOCTORS = [
    { id:'harris', featured:true, name:'Dr. Brian Harris', credential:'DMD',
      specialty:'Cosmetic & General Dentistry', clinic:'Harris Smile Studio',
      city:'Irvine', npi:null, verified:true, rating:4.9, reviews:1284,
      goals:['Whitening','Veneers','Clear aligners','Close gaps','Full makeover'],
      financingFrom:99, beforeAfters:42, accent:'#0E5450',
      bio:'Smile-design focused practice. 15+ years, 10,000+ smiles. Known for natural-looking veneers and same-week video consultations.' },

    { id:'aminikharrazi', name:'Dr. '+titleCase('Taher Aminikharrazi'), credential:'DDS',
      specialty:'Prosthodontics', clinic:'Newport Center Prosthodontics',
      city:'Newport Beach', npi:'1891908224', verified:true, rating:4.8, reviews:312,
      goals:['Veneers','Full makeover','Implants','Close gaps'],
      financingFrom:140, beforeAfters:28, accent:'#C9A24B',
      bio:'Prosthodontist specializing in full-mouth reconstruction, veneers, and implant-supported restorations.' },

    { id:'abidali', name:'Dr. '+titleCase('Ammar Abidali'), credential:'DDS',
      specialty:'General & Cosmetic Dentistry', clinic:'Birch Street Dental',
      city:'Newport Beach', npi:'1912750761', verified:true, rating:4.7, reviews:198,
      goals:['Whitening','Veneers','Chips & cracks','Clear aligners'],
      financingFrom:110, beforeAfters:19, accent:'#E8775B',
      bio:'Cosmetic-forward general practice with a focus on whitening, bonding, and minimally-invasive veneers.' },

    { id:'adames', name:'Dr. '+titleCase('Renata B Adames'), credential:'DDS',
      specialty:'General Practice', clinic:'19th Street Family Dental',
      city:'Costa Mesa', npi:'1902939143', verified:true, rating:4.6, reviews:241,
      goals:['Whitening','Close gaps','Chips & cracks','Clear aligners'],
      financingFrom:89, beforeAfters:15, accent:'#2C7D78',
      bio:'Family and cosmetic dentistry. Clear-aligner provider with a gentle, conservative approach.' },

    { id:'abdelmalek', name:'Dr. '+titleCase('Ashraf Sami Abdelmalek'), credential:'DDS',
      specialty:'General Practice', clinic:'Sand Canyon Dental',
      city:'Irvine', npi:'1437250214', verified:true, rating:4.8, reviews:176,
      goals:['Whitening','Veneers','Full makeover','Implants'],
      financingFrom:120, beforeAfters:23, accent:'#5B7A76',
      bio:'Comprehensive cosmetic and restorative care, from whitening to full smile makeovers.' },

    { id:'addonizio', name:'Dr. '+titleCase('Mary Kathleen Addonizio'), credential:'DDS',
      specialty:'General & Cosmetic Dentistry', clinic:'Oso Parkway Dental',
      city:'Mission Viejo', npi:'1699850636', verified:true, rating:4.9, reviews:407,
      goals:['Whitening','Veneers','Close gaps','Clear aligners','Chips & cracks'],
      financingFrom:95, beforeAfters:31, accent:'#0A3F3C',
      bio:'Highly-rated South County practice. Cosmetic bonding, veneers, and aligners with a focus on patient comfort.' },

    { id:'allen', name:'Dr. '+titleCase('Vivienne E Allen'), credential:'DDS',
      specialty:'General Practice', clinic:'La Paz Dental Group',
      city:'Mission Viejo', npi:'1750415196', verified:true, rating:4.5, reviews:132,
      goals:['Whitening','Chips & cracks','Close gaps'],
      financingFrom:79, beforeAfters:11, accent:'#8A6A12',
      bio:'Neighborhood practice offering whitening, bonding, and conservative cosmetic touch-ups.' }
  ];

  /* ---- geo helpers ---- */
  function haversineMi(a, b){
    const R=3958.8, toR=d=>d*Math.PI/180;
    const dLat=toR(b[0]-a[0]), dLng=toR(b[1]-a[1]);
    const s=Math.sin(dLat/2)**2 + Math.cos(toR(a[0]))*Math.cos(toR(b[0]))*Math.sin(dLng/2)**2;
    return Math.round(R*2*Math.atan2(Math.sqrt(s),Math.sqrt(1-s)));
  }
  function coordsFor(cityName){ return CITY[cityName] || CITY['Trabuco Canyon']; }

  global.Directory = { DOCTORS, GOALS, CITY, coordsFor, haversineMi };
})(window);

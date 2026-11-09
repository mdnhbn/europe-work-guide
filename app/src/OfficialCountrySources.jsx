const countries = [
  {
    code: 'IT',
    name: 'ইতালি',
    visa: {
      label: 'ভিসার ধরন ও নথি খুঁজুন',
      url: 'https://vistoperitalia.esteri.it/',
    },
    local: {
      label: 'ঢাকার ইতালি দূতাবাসের নথির তালিকা',
      url: 'https://ambdhaka.esteri.it/en/servizi-consolari-e-visti/servizi-per-il-cittadino-straniero/visti/scegli-il-visto-corretto-in-base-alle-tue-esigenze-e-controlla-quali-sono-i-documenti-necessari/',
    },
  },
  {
    code: 'DE',
    name: 'জার্মানি',
    visa: {
      label: 'কাজের ভিসার ধরন দেখুন',
      url: 'https://www.make-it-in-germany.com/en/visa-recognition/visa-types',
    },
    local: {
      label: 'ঢাকার জার্মান দূতাবাসের আবেদন নির্দেশনা',
      url: 'https://dhaka.diplo.de/bd-en/service/2682868-2682868',
    },
  },
  {
    code: 'FR',
    name: 'ফ্রান্স',
    visa: {
      label: 'চাকরির জন্য ভিসার তথ্য দেখুন',
      url: 'https://france-visas.gouv.fr/en/activite-salariee',
    },
    local: {
      label: 'বাংলাদেশ থেকে আবেদনের নির্দেশনা',
      url: 'https://www.france-visas.gouv.fr/en/bangladesh',
    },
  },
];

export default function OfficialCountrySources() {
  return (
    <section className="panel official-country-sources" id="official-country-sources" aria-labelledby="official-country-sources-title">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">দেশভিত্তিক সরকারি উৎস</p>
          <h2 id="official-country-sources-title">কাজের ভিসার তথ্য কোথায় পাবেন</h2>
        </div>
      </div>
      <p className="muted">প্রথমে কাজের ভিসার ধরন দেখুন। বাংলাদেশ থেকে আবেদন করলে দ্বিতীয় লিংকে স্থানীয় নির্দেশনা দেখুন। অন্য দেশে থাকলে আপনার বসবাসের এলাকার দপ্তরের নির্দেশনা দেখুন।</p>
      <div className="official-country-source-grid">
        {countries.map(({ code, name, visa, local }) => (
          <article className="official-country-source" key={code}>
            <h3>{name}</h3>
            <ol>
              {[visa, local].map(({ url, label }) => (
                <li key={url}><a href={url} target="_blank" rel="noreferrer">{label} <span aria-hidden="true">↗</span></a></li>
              ))}
            </ol>
          </article>
        ))}
      </div>
    </section>
  );
}

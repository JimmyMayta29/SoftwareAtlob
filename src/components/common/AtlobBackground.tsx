import atlobMesh from '../../assets/atlob-bg/atlob-mesh.svg';
import atlobLogo from '../../assets/atlob-bg/atlob-logo.png';
import atlobIso from '../../assets/atlob-bg/atlob-iso.png';
import '../../styles/atlob-bg.css';

export function AtlobBackground({ sinMarca = false }: { sinMarca?: boolean }) {
  return (
    <div className={sinMarca ? 'atlob-bg atlob-bg--sin-marca' : 'atlob-bg'} aria-hidden="true">
      <img className="atlob-bg__mesh" src={atlobMesh} alt="" />
      <img className="atlob-bg__iso" src={atlobIso} alt="" />
      <div className="atlob-bg__stage">
        <div className="atlob-eco">
          <svg className="atlob-eco__lines" viewBox="0 0 740 540" preserveAspectRatio="none">
            <defs>
              <linearGradient id="atlobGold" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#f1d479" />
                <stop offset=".5" stopColor="#d4a02a" />
                <stop offset="1" stopColor="#9a6f12" />
              </linearGradient>
            </defs>
            <polygon className="tri" points="370,20 0,510 740,510" />
            <g className="links" stroke="url(#atlobGold)">
              <line x1="370" y1="151" x2="268" y2="296" />
              <circle cx="319" cy="223.5" r="4.5" />
              <line x1="370" y1="151" x2="472" y2="296" />
              <circle cx="421" cy="223.5" r="4.5" />
              <line x1="268" y1="296" x2="166" y2="441" />
              <circle cx="217" cy="368.5" r="4.5" />
              <line x1="268" y1="296" x2="370" y2="441" />
              <circle cx="319" cy="368.5" r="4.5" />
              <line x1="472" y1="296" x2="370" y2="441" />
              <circle cx="421" cy="368.5" r="4.5" />
              <line x1="472" y1="296" x2="574" y2="441" />
              <circle cx="523" cy="368.5" r="4.5" />
            </g>
          </svg>
          <div className="atlob-chip" style={{ left: '37.838%', top: '22.222%' }}>
            <span className="atlob-chip__ic">
              <svg viewBox="-1 -1 32 32" fill="none" stroke="#f1d479" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 10c-2-2.5-9-2-9.5 2s8 3 8.5 7-7 4.5-9.5 2" />
              </svg>
            </span>
            <span className="atlob-chip__tx">
              <b>SUNAT</b>
            </span>
          </div>
          <div className="atlob-chip" style={{ left: '24.054%', top: '49.074%' }}>
            <span className="atlob-chip__ic">
              <svg viewBox="-1 -1 32 32" fill="none" stroke="#f1d479" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="7" width="12" height="16" rx="2" />
                <path d="M12 12h6M12 15.5h6M12 19h4" />
              </svg>
            </span>
            <span className="atlob-chip__tx">
              <b>SIRE</b>
            </span>
          </div>
          <div className="atlob-chip" style={{ left: '51.622%', top: '49.074%' }}>
            <span className="atlob-chip__ic">
              <svg viewBox="-1 -1 32 32" fill="none" stroke="#f1d479" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M13 10l-5 5 5 5M17 10l5 5-5 5" />
              </svg>
            </span>
            <span className="atlob-chip__tx">
              <b>UBL 2.1</b>
            </span>
          </div>
          <div className="atlob-chip" style={{ left: '10.270%', top: '75.926%' }}>
            <span className="atlob-chip__ic">
              <svg viewBox="-1 -1 32 32" fill="none" stroke="#f1d479" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 14a7 7 0 0 0-12.5-3M8 16a7 7 0 0 0 12.5 3M9.5 7v4h4M20.5 23v-4h-4" />
              </svg>
            </span>
            <span className="atlob-chip__tx">
              <small>ATLOB</small>
              <b>Sync</b>
            </span>
          </div>
          <div className="atlob-chip" style={{ left: '37.838%', top: '75.926%' }}>
            <span className="atlob-chip__ic">
              <svg viewBox="-1 -1 32 32" fill="none" stroke="#f1d479" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="7" y="9" width="16" height="12" rx="2" />
                <path d="M7.5 10l7.5 6 7.5-6" />
              </svg>
            </span>
            <span className="atlob-chip__tx">
              <small>ATLOB</small>
              <b>Buzón</b>
            </span>
          </div>
          <div className="atlob-chip" style={{ left: '65.405%', top: '75.926%' }}>
            <span className="atlob-chip__ic">
              <svg viewBox="-1 -1 32 32" fill="none" stroke="#f1d479" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="8" y="7" width="14" height="16" rx="2" />
                <path d="M13 7v16M16 12h4M16 16h4M16 20h4" />
              </svg>
            </span>
            <span className="atlob-chip__tx">
              <small>PCGE</small>
              <b>2027</b>
            </span>
          </div>
        </div>
        <div className="atlob-brand">
          <img src={atlobLogo} alt="ATLOB Consultores" />
          <hr />
          <h2>ERP 2026</h2>
          <p>Información ordenada. Decisiones mejor sustentadas.</p>
        </div>
      </div>
      <div className="atlob-bg__support">Soporte: WhatsApp 940 781 298 · Perú</div>
    </div>
  );
}

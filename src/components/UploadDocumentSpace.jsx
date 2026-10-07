import React from 'react';
import { UploadCloud, ArrowUpRight, Sparkles, CheckCircle, FileText, ShieldCheck, Zap } from 'lucide-react';

const uploadLink = 'https://www.playbook.com/techtitan/drop';

export default function UploadDocumentSpace() {
  return (
    <section className="creative-upload-space" style={{
      margin: '40px 0 60px',
      position: 'relative',
      background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.95) 0%, rgba(30, 41, 59, 0.9) 100%)',
      border: '2px solid rgba(0, 242, 254, 0.4)',
      borderRadius: '24px',
      padding: 'clamp(20px, 4vw, 40px)',
      boxShadow: '0 20px 50px rgba(0, 0, 0, 0.5), 0 0 30px rgba(0, 242, 254, 0.15)',
      overflow: 'hidden'
    }}>
      {/* Background neon ambient effects */}
      <div style={{
        position: 'absolute', top: '-60px', right: '-60px', width: '220px', height: '220px',
        background: 'radial-gradient(circle, rgba(0, 242, 254, 0.25) 0%, transparent 70%)',
        borderRadius: '50%', pointerEvents: 'none'
      }} />
      <div style={{
        position: 'absolute', bottom: '-60px', left: '-60px', width: '200px', height: '200px',
        background: 'radial-gradient(circle, rgba(245, 158, 11, 0.2) 0%, transparent 70%)',
        borderRadius: '50%', pointerEvents: 'none'
      }} />

      <div style={{ position: 'relative', zIndex: 1 }}>
        {/* Top Badges */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              background: 'linear-gradient(135deg, #00f2fe 0%, #4facfe 100%)',
              color: '#000', fontWeight: '900', fontSize: '0.8rem',
              padding: '4px 12px', borderRadius: '20px', letterSpacing: '0.5px', textTransform: 'uppercase'
            }}>
              <Zap size={14} /> Open Document Drop
            </span>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              background: 'rgba(255, 255, 255, 0.08)', color: '#cbd5e1',
              fontSize: '0.8rem', fontWeight: '700', padding: '4px 12px', borderRadius: '20px', border: '1px solid rgba(255, 255, 255, 0.15)'
            }}>
              <Sparkles size={13} style={{ color: '#f59e0b' }} /> Free Community Hub
            </span>
          </div>

          {/* Formats accepted */}
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {['PDF', 'DOCX', 'PPTX', 'IMAGES', 'HANDWRITTEN'].map((fmt) => (
              <span key={fmt} style={{
                background: 'rgba(0, 0, 0, 0.4)', color: '#94a3b8', fontSize: '0.72rem',
                fontWeight: '800', padding: '3px 8px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.08)'
              }}>
                {fmt}
              </span>
            ))}
          </div>
        </div>

        {/* Main Content Area */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '28px', alignItems: 'center' }}>
          <div>
            <h2 style={{
              fontSize: 'clamp(1.8rem, 3.5vw, 2.6rem)',
              fontWeight: '900',
              lineHeight: '1.15',
              marginBottom: '14px',
              background: 'linear-gradient(135deg, #00f2fe 0%, #38bdf8 50%, #facc15 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              filter: 'drop-shadow(0 0 15px rgba(0, 242, 254, 0.25))'
            }}>
              Have notes to share? <br />
              <span>Drop them into the hub.</span>
            </h2>
            <p style={{ color: '#cbd5e1', fontSize: '1rem', lineHeight: '1.6', margin: '0 0 20px', maxWidth: '480px' }}>
              Upload handwritten notes, lecture slides, question banks, or cheat sheets for your classmates. No login barrier. Direct upload via Playbook.
            </p>

            {/* Feature Pills */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#e2e8f0', fontSize: '0.9rem' }}>
                <CheckCircle size={16} style={{ color: '#10b981', flexShrink: 0 }} />
                <span><strong>Instant Upload:</strong> Drop files straight to cloud with 1 click.</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#e2e8f0', fontSize: '0.9rem' }}>
                <ShieldCheck size={16} style={{ color: '#00f2fe', flexShrink: 0 }} />
                <span><strong>Admin Moderation:</strong> Verified by Content Admins before publication.</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#e2e8f0', fontSize: '0.9rem' }}>
                <FileText size={16} style={{ color: '#f59e0b', flexShrink: 0 }} />
                <span><strong>Organized by Year:</strong> Synced into CC, CNS, AI, and Deep Learning rooms.</span>
              </div>
            </div>
          </div>

          {/* Interactive Action Card */}
          <div style={{
            background: 'rgba(0, 0, 0, 0.4)',
            border: '2px dashed rgba(0, 242, 254, 0.4)',
            borderRadius: '18px',
            padding: '28px',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'border-color 0.2s'
          }}>
            <div style={{
              width: '68px', height: '68px', borderRadius: '50%',
              background: 'linear-gradient(135deg, rgba(0, 242, 254, 0.2) 0%, rgba(56, 189, 248, 0.3) 100%)',
              border: '2px solid #00f2fe', display: 'grid', placeItems: 'center',
              color: '#00f2fe', marginBottom: '16px'
            }}>
              <UploadCloud size={34} />
            </div>

            <h3 style={{
              fontSize: '1.35rem',
              margin: '0 0 8px',
              fontWeight: '900',
              background: 'linear-gradient(135deg, #00f2fe 0%, #38bdf8 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent'
            }}>
              Upload Your Study Material
            </h3>
            <p style={{ color: '#94a3b8', fontSize: '0.88rem', margin: '0 0 20px', maxWidth: '300px' }}>
              Click below to open the dedicated upload drop zone.
            </p>

            <a
              href={uploadLink}
              target="_blank"
              rel="noreferrer"
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
                background: 'linear-gradient(135deg, #00f2fe 0%, #4facfe 100%)',
                color: '#000', fontWeight: '900', fontSize: '1.05rem',
                padding: '14px 28px', borderRadius: '12px', textDecoration: 'none',
                boxShadow: '0 6px 20px rgba(0, 242, 254, 0.35)', transition: 'all 0.15s ease',
                width: '100%', maxWidth: '320px'
              }}
            >
              <span>Upload Document Now</span>
              <ArrowUpRight size={20} />
            </a>
            </div>
        </div>
      </div>
    </section>
  );
}

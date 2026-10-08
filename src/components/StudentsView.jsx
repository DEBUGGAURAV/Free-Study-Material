import React, { useState } from 'react';
import { ArrowUpRight, Award, Sparkles, Users, Zap, CheckCircle2, BookOpen } from 'lucide-react';

const students = [
  { name: 'Aarav Mehta', branch: 'Computer Science & Eng', year: '3rd year', initials: 'AM', score: '92%', tag: 'Top Contributor', notesShared: 18 },
  { name: 'Meera Iyer', branch: 'Information Technology', year: '2nd year', initials: 'MI', score: '88%', tag: 'Study Lead', notesShared: 14 },
  { name: 'Kabir Shah', branch: 'Computer Science & Eng', year: '4th year', initials: 'KS', score: '95%', tag: 'Senior Archon', notesShared: 25 },
  { name: 'Priya Sharma', branch: 'Artificial Intelligence', year: '3rd year', initials: 'PS', score: '94%', tag: 'Core Mentor', notesShared: 19 },
  { name: 'Rohan Verma', branch: 'Data Science', year: '2nd year', initials: 'RV', score: '89%', tag: 'Peer Reviewer', notesShared: 12 },
  { name: 'Ananya Sen', branch: 'Cyber Security', year: '4th year', initials: 'AS', score: '97%', tag: 'Vault Contributor', notesShared: 31 },
];

export default function StudentsView() {
  const [showAll, setShowAll] = useState(false);
  const visibleStudents = showAll ? students : students.slice(0, 6);

  return (
    <section>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '20px', marginBottom: '32px' }}>
        <div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '4px 12px', background: 'rgba(99, 102, 241, 0.1)', border: '1px solid rgba(99, 102, 241, 0.25)', borderRadius: 'var(--radius-full)', fontSize: '0.78rem', fontWeight: 600, color: 'var(--primary-light)', marginBottom: '10px' }}>
            <Users size={14} />
            <span>Academic Peer Network & Contributors</span>
          </div>
          <h2 style={{ fontSize: 'clamp(1.8rem, 3vw, 2.5rem)' }}>
            Student Community Hub
          </h2>
        </div>

        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          background: 'var(--bg-card)',
          border: '1px solid var(--border-card)',
          borderRadius: 'var(--radius-lg)',
          padding: '16px 22px',
          backdropFilter: 'blur(16px)'
        }}>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--accent-cyan)', lineHeight: 1 }}>
            8,450+
          </div>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.3 }}>
            Active Students<br />Sharing Knowledge
          </div>
        </div>
      </header>

      {/* Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px' }}>
        {visibleStudents.map((student) => (
          <div
            key={student.name}
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-card)',
              borderRadius: 'var(--radius-lg)',
              padding: '24px',
              backdropFilter: 'blur(16px)',
              transition: 'all 0.2s ease',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between'
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <div style={{
                  width: '46px',
                  height: '46px',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--grad-primary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.1rem',
                  fontWeight: 800,
                  color: '#fff',
                  boxShadow: '0 4px 15px rgba(99, 102, 241, 0.3)'
                }}>
                  {student.initials}
                </div>

                <span className="badge" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#34d399', border: '1px solid rgba(16, 185, 129, 0.25)' }}>
                  {student.tag}
                </span>
              </div>

              <h3 style={{ fontSize: '1.15rem', marginBottom: '4px', color: 'var(--text-pure)' }}>
                {student.name}
              </h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
                {student.branch} • {student.year}
              </p>

              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '10px',
                padding: '12px',
                background: 'rgba(255, 255, 255, 0.03)',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-subtle)',
                marginBottom: '18px'
              }}>
                <div>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)', display: 'block' }}>Notes Shared</span>
                  <strong style={{ fontSize: '0.96rem', color: 'var(--text-pure)' }}>{student.notesShared} files</strong>
                </div>
                <div>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)', display: 'block' }}>Accuracy Rating</span>
                  <strong style={{ fontSize: '0.96rem', color: '#10b981' }}>{student.score}</strong>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '14px', borderTop: '1px solid var(--border-subtle)' }}>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>Verified Contributor</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.82rem', color: 'var(--accent-cyan)', fontWeight: 600 }}>
                Active Peer <CheckCircle2 size={13} style={{ color: '#10b981' }} />
              </span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

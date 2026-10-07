import React, { useState } from 'react';
import { ArrowUpRight, Award, Sparkles, Users, Zap } from 'lucide-react';

const students = [
  { name: 'Aarav Mehta', branch: 'Computer Science', year: '3rd year', initials: 'AM', score: '92%', color: 'coral', tag: 'Top Contributor' },
  { name: 'Meera Iyer', branch: 'Information Technology', year: '2nd year', initials: 'MI', score: '88%', color: 'blue', tag: 'Study Lead' },
  { name: 'Kabir Shah', branch: 'Computer Science', year: '4th year', initials: 'KS', score: '95%', color: 'yellow', tag: 'Resource Archon' },
  { name: 'Priya Sharma', branch: 'Artificial Intelligence', year: '3rd year', initials: 'PS', score: '94%', color: 'coral', tag: 'Core Mentor' },
  { name: 'Rohan Verma', branch: 'Data Science', year: '2nd year', initials: 'RV', score: '89%', color: 'blue', tag: 'Lab Captain' },
  { name: 'Ananya Sen', branch: 'Cyber Security', year: '4th year', initials: 'AS', score: '97%', color: 'yellow', tag: 'Code Master' },
];

export default function StudentsView({ onProfile }) {
  const [showAll, setShowAll] = useState(false);
  const visibleStudents = showAll ? students : students.slice(0, 3);

  return (
    <section className="page-width">
      <header className="view-head">
        <div>
          <span className="eyebrow" style={{ color: '#00f2fe' }}>
            <Users size={16} /> ACADEMIC PEER NETWORK
          </span>
          <h1 className="view-title">
            People who<br />get it.
          </h1>
        </div>
        <div className="stat-note" style={{
          background: 'linear-gradient(135deg, rgba(0, 242, 254, 0.16) 0%, rgba(56, 189, 248, 0.12) 100%)',
          border: '1.5px solid rgba(0, 242, 254, 0.45)',
          borderRadius: '16px', padding: '14px 22px',
          boxShadow: '0 0 25px rgba(0, 242, 254, 0.25)'
        }}>
          <strong style={{
            background: 'linear-gradient(135deg, #00f2fe 0%, #38bdf8 100%)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            fontSize: '2.4rem'
          }}>
            8,240
          </strong>
          <span style={{ color: '#cbd5e1', fontWeight: '700', fontSize: '0.9rem' }}>
            active peers<br />collaborating daily
          </span>
        </div>
      </header>

      <div className="people-grid">
        {visibleStudents.map((student) => (
          <article key={student.name} className={`person-card tone-${student.color}`} style={{
            background: 'linear-gradient(145deg, rgba(20, 30, 52, 0.9) 0%, rgba(15, 23, 42, 0.96) 100%)',
            border: '1.5px solid rgba(255, 255, 255, 0.14)',
            borderRadius: '20px',
            boxShadow: '0 10px 35px rgba(0, 0, 0, 0.45)',
            overflow: 'hidden',
            transition: 'all 0.2s ease'
          }}>
            <div className="person-top" style={{ padding: '20px 22px 0' }}>
              <div className="avatar-circle" style={{
                border: '2px solid rgba(0, 242, 254, 0.6)',
                boxShadow: '0 0 15px rgba(0, 242, 254, 0.35)'
              }}>
                {student.initials}
              </div>
              <span className="chip" style={{
                marginBottom: 12,
                background: 'rgba(16, 185, 129, 0.15)',
                border: '1px solid rgba(16, 185, 129, 0.4)',
                color: '#10b981',
                fontSize: '0.8rem',
                fontWeight: '800'
              }}>
                <span className="live-dot" style={{ background: '#10b981' }} /> Active Now
              </span>
            </div>
            <div className="person-body">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                <h3 style={{
                  fontSize: '1.35rem',
                  background: 'linear-gradient(135deg, #00f2fe 0%, #38bdf8 50%, #c084fc 100%)',
                  WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent'
                }}>
                  {student.name}
                </h3>
                <span style={{
                  fontSize: '0.72rem', fontWeight: '900', padding: '2px 8px', borderRadius: '6px',
                  background: 'rgba(0, 242, 254, 0.12)', color: '#00f2fe', border: '1px solid rgba(0, 242, 254, 0.3)'
                }}>
                  {student.tag}
                </span>
              </div>
              <p style={{ color: '#94a3b8', fontSize: '0.92rem', margin: '0 0 18px' }}>
                {student.branch} • {student.year}
              </p>
              <div className="person-foot" style={{ borderTop: '1px solid rgba(255, 255, 255, 0.1)', paddingTop: '14px' }}>
                <span style={{ fontSize: '0.88rem', color: '#cbd5e1' }}>
                  Score: <b style={{ color: '#facc15', fontSize: '1rem' }}>{student.score}</b>
                </span>
                <button
                  className="link-btn"
                  onClick={onProfile}
                  style={{
                    color: '#00f2fe', fontWeight: '800',
                    display: 'inline-flex', alignItems: 'center', gap: '4px', cursor: 'pointer'
                  }}
                >
                  Profile <ArrowUpRight size={16} />
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>

      {students.length > 3 && (
        <div style={{ textAlign: 'center', marginTop: '36px' }}>
          <button
            onClick={() => setShowAll((prev) => !prev)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '12px 32px',
              borderRadius: '50px',
              background: 'linear-gradient(135deg, rgba(0, 242, 254, 0.18) 0%, rgba(56, 189, 248, 0.12) 100%)',
              border: '1.5px solid rgba(0, 242, 254, 0.5)',
              color: '#00f2fe',
              fontWeight: '800',
              fontSize: '0.92rem',
              cursor: 'pointer',
              boxShadow: '0 0 25px rgba(0, 242, 254, 0.25)',
              transition: 'all 0.18s ease'
            }}
          >
            {showAll ? 'Show Latest 3 Peers' : `Show All ${students.length} Peers`}
          </button>
        </div>
      )}
    </section>
  );
}

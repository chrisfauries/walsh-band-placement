import React, { useState, useEffect, useRef } from 'react';
import { 
  ref, onValue, push, update, remove 
} from 'firebase/database';
import { 
  signInWithEmailAndPassword, createUserWithEmailAndPassword, 
  signOut, onAuthStateChanged,  
} from 'firebase/auth';
import type {User} from 'firebase/auth';
import { db, auth } from './firebase'; // Make sure auth is imported!

// ==========================================
// CONSTANTS & TYPES
// ==========================================
type GradeLevel = '6' | '7' | '8' | '?';

interface Student {
  id: string;
  name: string;
  instrument: string;
  band: string;
  grade: GradeLevel;
}

interface Band {
  name: string;
  color: string;
}

const DEFAULT_BANDS: Band[] = [
  { name: 'Honor Band', color: '#fef08a' }, 
  { name: 'Symphonic Band', color: '#e2e8f0' }, 
  { name: 'Concert Band', color: '#fed7aa' }, 
  { name: 'Intermediate Band', color: '#bae6fd' }, 
];

const INSTRUMENTS = [
  'Flute', 'Clarinet', 'Saxophone', 'Oboe', 'Bassoon',
  'Trumpet', 'Horn', 'Trombone', 'Euphonium', 'Tuba', 'Percussion'
];

// ==========================================
// MAIN APP COMPONENT
// ==========================================
export default function App() {
  // --- Auth State ---
  const [user, setUser] = useState<User | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);

  // --- Database State ---
  const [students, setStudents] = useState<Student[]>([]);
  const [bands, setBands] = useState<Band[]>(DEFAULT_BANDS);
  const [draggedStudentId, setDraggedStudentId] = useState<string | null>(null);

  // --- Listen to Authentication Status ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoadingAuth(false);
    });
    return () => unsubscribe();
  }, []);

  // --- Fetch Data from Firebase (Only if logged in) ---
  useEffect(() => {
    if (!user) return; // Don't fetch if not logged in

    const studentsRef = ref(db, 'students');
    const unsubStudents = onValue(studentsRef, (snapshot) => {
      const data = snapshot.val();
      const studentsData: Student[] = [];
      if (data) {
        Object.keys(data).forEach((key) => {
          studentsData.push({ id: key, ...data[key] });
        });
      }
      setStudents(studentsData);
    });

    const bandsRef = ref(db, 'bands');
    const unsubBands = onValue(bandsRef, (snapshot) => {
      const data = snapshot.val();
      if (!data) {
        const updates: any = {};
        DEFAULT_BANDS.forEach(b => { updates[`bands/${b.name}`] = b; });
        update(ref(db), updates);
      } else {
        const bandsData: Band[] = Object.values(data);
        const sortedBands = DEFAULT_BANDS
          .map(defaultBand => bandsData.find(b => b.name === defaultBand.name))
          .filter(Boolean) as Band[];
        setBands(sortedBands.length ? sortedBands : bandsData);
      }
    });

    return () => { unsubStudents(); unsubBands(); };
  }, [user]);

  // --- Handlers (Drag & Drop, Edits, etc.) ---
  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedStudentId(id);
    e.dataTransfer.setData('text/plain', id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = async (e: React.DragEvent, targetBand: string, targetInstrument: string) => {
    e.preventDefault();
    const studentId = e.dataTransfer.getData('text/plain') || draggedStudentId;
    if (!studentId) return;
    await update(ref(db, `students/${studentId}`), { band: targetBand, instrument: targetInstrument });
    setDraggedStudentId(null);
  };

  const handleDeleteDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const studentId = e.dataTransfer.getData('text/plain') || draggedStudentId;
    if (!studentId) return;
    await remove(ref(db, `students/${studentId}`));
    setDraggedStudentId(null);
  };

  const handleAddStudent = async (band: string, instrument: string) => {
    await push(ref(db, 'students'), { name: 'New Student', instrument, band, grade: '?' });
  };

  const handleNameEdit = async (id: string, newName: string) => {
    if (!newName.trim()) return;
    await update(ref(db, `students/${id}`), { name: newName.trim() });
  };

  const handleCycleGrade = async (id: string, currentGrade: GradeLevel) => {
    const sequence: GradeLevel[] = ['?', '6', '7', '8'];
    const nextIndex = (sequence.indexOf(currentGrade) + 1) % sequence.length;
    await update(ref(db, `students/${id}`), { grade: sequence[nextIndex] });
  };

  const handleColorChange = async (bandName: string, newColor: string) => {
    await update(ref(db, `bands/${bandName}`), { color: newColor });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const text = await file.text();
    const lines = text.split('\n').filter(l => l.trim() !== '');
    const startIndex = lines[0].toLowerCase().includes('name') ? 1 : 0;
    
    const updates: any = {};
    for (let i = startIndex; i < lines.length; i++) {
      const [name, instrument, band, grade] = lines[i].split(',').map(s => s.trim());
      if (name) {
        const newStudentKey = push(ref(db, 'students')).key;
        updates[`students/${newStudentKey}`] = { 
          name, instrument: instrument || 'Unassigned', band: band || 'Unassigned', grade: grade || '?'
        };
      }
    }
    await update(ref(db), updates);
    if (e.target) e.target.value = '';
  };

  // --- Render Flow ---
  if (loadingAuth) {
    return <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-500">Loading...</div>;
  }

  if (!user) {
    return <AuthScreen />;
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 font-sans text-slate-800 pb-12">
      {/* Header & Controls */}
      <header className="mb-6 flex flex-col md:flex-row items-center justify-between gap-4 bg-white p-4 rounded-xl shadow-sm border border-slate-200">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900">Band Roster Matrix</h1>
            <button 
              onClick={() => signOut(auth)} 
              className="text-xs text-slate-400 hover:text-slate-700 underline bg-slate-100 px-2 py-1 rounded"
            >
              Sign Out
            </button>
          </div>
          <p className="text-sm text-slate-500">Drag and drop students to organize your ensembles</p>
        </div>
        
        <div className="flex flex-col items-end gap-1">
          <label className="cursor-pointer bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm">
            Import CSV
            <input type="file" accept=".csv" className="hidden" onChange={handleFileUpload} />
          </label>
          <span className="text-xs text-slate-400">Format: Name, Instrument, Band, Grade</span>
        </div>
      </header>

      {/* Grid Container */}
      <div className="overflow-x-auto bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-6">
        <div className="min-w-max">
          
          {/* Header Row (Instruments) */}
          <div className="flex border-b-2 border-slate-800 pb-2 mb-2">
            <div className="w-48 shrink-0 font-bold text-slate-400 uppercase text-xs flex items-end">
              Ensemble \ Instrument
            </div>
            {INSTRUMENTS.map(instrument => (
              <div key={instrument} className="w-36 shrink-0 font-bold text-slate-700 text-sm px-2 text-center">
                {instrument}
              </div>
            ))}
          </div>

          {/* Matrix Rows (Bands) */}
          {bands.map((band) => (
            <div key={band.name} className="flex border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors">
              
              <div className="w-48 shrink-0 py-4 pr-4 flex items-center gap-3 border-r border-slate-200">
                <div className="relative group/picker cursor-pointer w-6 h-6 rounded overflow-hidden shadow-sm border border-black/20 shrink-0">
                  <input 
                    type="color" 
                    value={band.color} 
                    onChange={(e) => handleColorChange(band.name, e.target.value)}
                    className="absolute -top-2 -left-2 w-10 h-10 cursor-pointer"
                    title="Change Band Color"
                  />
                </div>
                <span className="font-semibold text-sm truncate">{band.name}</span>
              </div>

              {INSTRUMENTS.map((instrument) => {
                const cellStudents = students.filter(s => s.band === band.name && s.instrument === instrument);

                return (
                  <div
                    key={`${band.name}-${instrument}`}
                    className="group/cell w-36 shrink-0 min-h-[80px] p-2 border-r border-slate-100 last:border-r-0 flex flex-col gap-1.5 transition-colors relative pb-8"
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, band.name, instrument)}
                  >
                    {cellStudents.map(student => (
                      <StudentCard 
                        key={student.id} student={student} color={band.color}
                        onDragStart={handleDragStart} onEditName={handleNameEdit} onCycleGrade={handleCycleGrade}
                      />
                    ))}

                    <button
                      onClick={() => handleAddStudent(band.name, instrument)}
                      className="absolute bottom-2 left-2 right-2 py-1 rounded border border-dashed border-slate-300 text-slate-400 hover:text-slate-700 hover:border-slate-500 hover:bg-slate-100 transition-all flex items-center justify-center text-xs opacity-0 group-hover/cell:opacity-100"
                    >
                      + Add Student
                    </button>
                  </div>
                );
              })}
            </div>
          ))}

        </div>
      </div>

      {/* Global Delete Drop Zone */}
      <div 
        onDragOver={handleDragOver} onDrop={handleDeleteDrop}
        className="w-full h-24 border-2 border-dashed border-red-300 bg-red-50 text-red-500 rounded-xl flex items-center justify-center font-bold text-lg shadow-inner transition-colors hover:bg-red-100 hover:border-red-400"
      >
        🗑️ Drop Student Here to Delete
      </div>

    </div>
  );
}

// ==========================================
// AUTH SCREEN SUB-COMPONENT
// ==========================================
function AuthScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
    
        await signInWithEmailAndPassword(auth, email, password);
 
    } catch (err: any) {
      setError(err.message || 'Authentication failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="bg-white p-8 rounded-xl shadow-lg max-w-sm w-full border border-slate-200">
        <h2 className="text-2xl font-bold text-center text-slate-800 mb-6">
          {'Top Secret'}
        </h2>
        
        {error && (
          <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm mb-4 border border-red-200">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
            <input 
              type="email" 
              required 
              value={email} 
              onChange={(e) => setEmail(e.target.value)}
              className="w-full p-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
            <input 
              type="password" 
              required 
              value={password} 
              onChange={(e) => setPassword(e.target.value)}
              className="w-full p-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          
          <button 
            type="submit" 
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 rounded-lg transition-colors mt-2 disabled:opacity-50"
          >
            {loading && 'Processing...'}
            {!loading && 'Sign In' }
          </button>
        </form>

        <p className="text-center text-sm text-slate-500 mt-6">
        </p>
      </div>
    </div>
  );
}

// ==========================================
// STUDENT CARD SUB-COMPONENT
// ==========================================
interface StudentCardProps {
  student: Student;
  color: string;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onEditName: (id: string, newName: string) => void;
  onCycleGrade: (id: string, currentGrade: GradeLevel) => void;
}

function StudentCard({ student, color, onDragStart, onEditName, onCycleGrade }: StudentCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(student.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleBlurOrSubmit = () => {
    setIsEditing(false);
    if (editValue !== student.name) onEditName(student.id, editValue);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleBlurOrSubmit();
    if (e.key === 'Escape') {
      setEditValue(student.name);
      setIsEditing(false);
    }
  };

  const handleGradeClick = (e: React.MouseEvent) => {
    e.stopPropagation(); 
    onCycleGrade(student.id, student.grade);
  };

  return (
    <div
      draggable={!isEditing}
      onDragStart={(e) => onDragStart(e, student.id)}
      onDoubleClick={() => setIsEditing(true)}
      style={{ backgroundColor: color }}
      className="group relative flex items-center justify-between p-1.5 px-2 rounded-md shadow-sm border border-black/10 cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow z-10"
    >
      <button 
        onClick={handleGradeClick}
        title="Click to change grade"
        className="absolute -top-1.5 -left-1.5 bg-slate-800 hover:bg-slate-600 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center shadow-sm cursor-pointer transition-colors"
      >
        {student.grade}
      </button>

      {isEditing ? (
        <input
          ref={inputRef} value={editValue} onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleBlurOrSubmit} onKeyDown={handleKeyDown}
          className="w-full text-xs font-medium bg-white/70 border border-black/20 rounded px-1 outline-none"
        />
      ) : (
        <span className="text-xs font-medium text-slate-800 truncate ml-2">{student.name}</span>
      )}
    </div>
  );
}
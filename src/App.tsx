import React, { useState, useEffect, useRef } from 'react';
import { 
  ref, onValue, push, update, remove 
} from 'firebase/database';
import { 
  signInWithEmailAndPassword, 
  signOut, onAuthStateChanged,  
} from 'firebase/auth';
import type {User} from 'firebase/auth';
import { db, auth } from './firebase'; 

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
  position?: number;
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
  { name: 'Beginner', color: '#dcfce7' }, 
  { name: 'Dropped', color: '#f3f4f6' }, 
];

const INSTRUMENTS = [
  'Flute', 'Clarinet', 'Oboe', 'Bassoon','Saxophone', 
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
  
  // --- Drag & Drop State ---
  const [draggedStudentId, setDraggedStudentId] = useState<string | null>(null);
  const [activeZone, setActiveZone] = useState<{band: string, instrument: string} | null>(null);
  
  // --- Modal States ---
  const [csvErrors, setCsvErrors] = useState<string[] | null>(null);
  const [isClearModalOpen, setIsClearModalOpen] = useState(false);

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
    if (!user) return; 

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
        
        const missingBands = DEFAULT_BANDS.filter(
          defaultBand => !bandsData.some(b => b.name === defaultBand.name)
        );

        if (missingBands.length > 0) {
          const updates: any = {};
          missingBands.forEach(b => { updates[`bands/${b.name}`] = b; });
          update(ref(db), updates);
        }

        const sortedBands = DEFAULT_BANDS
          .map(defaultBand => bandsData.find(b => b.name === defaultBand.name) || defaultBand)
          .filter(Boolean) as Band[];
          
        const customBands = bandsData.filter(
          b => !DEFAULT_BANDS.some(defaultBand => defaultBand.name === b.name)
        );

        setBands([...sortedBands, ...customBands]);
      }
    });

    return () => { unsubStudents(); unsubBands(); };
  }, [user]);

  // --- Drag & Drop Handlers ---
  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedStudentId(id);
    e.dataTransfer.setData('text/plain', id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragEnd = () => {
    setDraggedStudentId(null);
    setActiveZone(null);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  // Handles dropping on the empty space of a cell (appends to end)
  const handleCellDrop = async (e: React.DragEvent, targetBand: string, targetInstrument: string) => {
    e.preventDefault();
    setActiveZone(null);
    const studentId = e.dataTransfer.getData('text/plain') || draggedStudentId;
    if (!studentId) return;

    const cellStudents = students.filter(s => s.band === targetBand && s.instrument === targetInstrument);
    const maxPos = cellStudents.length > 0 ? Math.max(...cellStudents.map(s => s.position ?? 0)) : 0;

    await update(ref(db, `students/${studentId}`), { 
      band: targetBand, 
      instrument: targetInstrument,
      position: maxPos + 1000
    });
    setDraggedStudentId(null);
  };

  // Handles dropping explicitly ON a blue drop indicator line between cards
  const handleReorder = async (studentId: string, targetBand: string, targetInstrument: string, newPos: number) => {
    await update(ref(db, `students/${studentId}`), {
      band: targetBand,
      instrument: targetInstrument,
      position: newPos
    });
    setDraggedStudentId(null);
    setActiveZone(null);
  };

  const handleDeleteDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setActiveZone(null);
    const studentId = e.dataTransfer.getData('text/plain') || draggedStudentId;
    if (!studentId) return;
    await remove(ref(db, `students/${studentId}`));
    setDraggedStudentId(null);
  };

  const handleAddStudent = async (band: string, instrument: string) => {
    const cellStudents = students.filter(s => s.band === band && s.instrument === instrument);
    const maxPos = cellStudents.length > 0 ? Math.max(...cellStudents.map(s => s.position ?? 0)) : 0;
    
    await push(ref(db, 'students'), { 
      name: 'New Student', 
      instrument, 
      band, 
      grade: '?',
      position: maxPos + 1000 
    });
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

  // --- Export CSV ---
  const handleExportCSV = () => {
    const headers = ['Name', 'Instrument', 'Band', 'Grade', 'Position'];
    const sortedStudents = [...students].sort((a, b) => {
      if (a.band !== b.band) return a.band.localeCompare(b.band);
      if (a.instrument !== b.instrument) return a.instrument.localeCompare(b.instrument);
      return (a.position ?? 0) - (b.position ?? 0);
    });

    const rows = sortedStudents.map(s => `${s.name},${s.instrument},${s.band},${s.grade},${s.position ?? 0}`);
    const csvContent = [headers.join(','), ...rows].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `band_roster_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleClearBoard = async () => {
    await remove(ref(db, 'students'));
    setIsClearModalOpen(false);
  };

  // --- Import CSV ---
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const text = await file.text();
    const lines = text.split('\n').filter(l => l.trim() !== '');
    const startIndex = lines[0].toLowerCase().includes('name') ? 1 : 0;
    
    const updates: any = {};
    const validationErrors: string[] = [];
    const VALID_BANDS = DEFAULT_BANDS.map(b => b.name);
    const VALID_GRADES = ['6', '7', '8', '?'];

    for (let i = startIndex; i < lines.length; i++) {
      const originalLine = lines[i];
      const parts = originalLine.split(',').map(s => s.trim());
      const name = parts[0] || '';
      const instrument = parts[1] || '';
      const band = parts[2] || '';
      const grade = parts[3] || '';
      
      let position = parseFloat(parts[4] || '');
      if (isNaN(position)) position = 1000 + (i * 1000); 
      
      const lineNumber = i + 1;

      if (!name) validationErrors.push(`Line ${lineNumber}: 'Name' column is empty. [Raw Line: "${originalLine}"]`);
      if (!INSTRUMENTS.includes(instrument)) validationErrors.push(`Line ${lineNumber}: 'Instrument' column issue ("${instrument}" is not valid). [Raw Line: "${originalLine}"]`);
      if (!VALID_BANDS.includes(band)) validationErrors.push(`Line ${lineNumber}: 'Band' column issue ("${band}" is not valid). [Raw Line: "${originalLine}"]`);
      if (!VALID_GRADES.includes(grade)) validationErrors.push(`Line ${lineNumber}: 'Grade' column issue ("${grade}" is not valid). [Raw Line: "${originalLine}"]`);

      if (name && INSTRUMENTS.includes(instrument) && VALID_BANDS.includes(band) && VALID_GRADES.includes(grade)) {
        const newStudentKey = push(ref(db, 'students')).key;
        updates[`students/${newStudentKey}`] = { name, instrument, band, grade, position };
      }
    }
    
    if (validationErrors.length > 0) setCsvErrors(validationErrors);
    else await update(ref(db), updates);

    if (e.target) e.target.value = '';
  };

  if (loadingAuth) return <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-500">Loading...</div>;
  if (!user) return <AuthScreen />;

  return (
    <div className="min-h-screen bg-slate-50 p-2 sm:p-4 font-sans text-slate-800 pb-12 flex flex-col">
      
      {/* Clear Board Warning Modal Overlay */}
      {isClearModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-lg max-w-md w-full overflow-hidden">
            <div className="p-4 border-b border-slate-200 bg-red-50">
              <h3 className="text-lg font-bold text-red-600">⚠️ Clear Entire Board?</h3>
            </div>
            <div className="p-5 bg-white text-sm text-slate-700">
              <p>Are you sure you want to remove all students from the board? This action <strong>cannot be undone</strong>.</p>
              <p className="mt-3 text-red-500 font-medium p-3 bg-red-50 border border-red-100 rounded">
                Please make sure you have used the Export CSV button to create a backup first!
              </p>
            </div>
            <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end gap-3">
              <button 
                onClick={() => setIsClearModalOpen(false)} 
                className="px-4 py-2 bg-slate-200 text-slate-800 font-medium rounded-lg hover:bg-slate-300 transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={handleClearBoard} 
                className="px-4 py-2 bg-red-600 text-white font-medium rounded-lg hover:bg-red-700 transition-colors shadow-sm"
              >
                Yes, Clear Board
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CSV Error Modal Overlay */}
      {csvErrors && csvErrors.length > 0 && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-lg max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden">
            <div className="p-4 border-b border-slate-200 bg-red-50">
              <h3 className="text-lg font-bold text-red-600">CSV Formatting Issues</h3>
              <p className="text-sm text-red-500 mt-1">
                Please fix the following errors and upload the file again. <br/>
                <strong>No students were imported.</strong>
              </p>
            </div>
            
            <div className="p-4 border-b border-slate-200 bg-slate-100 text-sm text-slate-700">
              <h4 className="font-bold mb-2">Valid Exact Options (Case Sensitive):</h4>
              <p><strong>Instruments:</strong> {INSTRUMENTS.join(', ')}</p>
              <p className="mt-1"><strong>Bands:</strong> {DEFAULT_BANDS.map(b => b.name).join(', ')}</p>
              <p className="mt-1"><strong>Grades:</strong> 6, 7, 8, ?</p>
            </div>

            <div className="p-4 overflow-y-auto bg-white flex-1">
              <ul className="list-disc pl-5 text-sm text-slate-700 space-y-2 font-mono">
                {csvErrors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </div>
            <div className="p-4 border-t border-slate-200 bg-slate-50 text-right">
              <button 
                onClick={() => setCsvErrors(null)} 
                className="px-5 py-2 bg-slate-800 text-white font-medium rounded-lg hover:bg-slate-700 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header & Controls */}
      <header className="mb-4 flex flex-col md:flex-row items-center justify-between gap-4 bg-white p-4 rounded-xl shadow-sm border border-slate-300">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900">Band Placement</h1>
            <button 
              onClick={() => signOut(auth)} 
              className="text-xs text-slate-400 hover:text-slate-700 underline bg-slate-100 px-2 py-1 rounded"
            >
              Sign Out
            </button>
          </div>
          <p className="text-sm text-slate-500 mt-1">Drag and drop students to organize your ensembles</p>
        </div>
        
        <div className="flex flex-col items-end gap-2">
          <div className="flex flex-wrap items-center gap-2 justify-end">
            <button 
              onClick={() => setIsClearModalOpen(true)}
              className="px-4 py-2 bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700 border border-red-200 rounded-lg text-sm font-medium transition-colors shadow-sm"
            >
              Clear Board
            </button>
            <button 
              onClick={handleExportCSV}
              className="px-4 py-2 bg-white text-slate-700 hover:bg-slate-50 border border-slate-300 rounded-lg text-sm font-medium transition-colors shadow-sm"
            >
              Export CSV
            </button>
            <label className="cursor-pointer bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm">
              Import CSV
              <input type="file" accept=".csv" className="hidden" onChange={handleFileUpload} />
            </label>
          </div>
          <span className="text-xs text-slate-400 text-right">
            CSV Format: Name, Instrument, Band, Grade, Position (Optional)
          </span>
        </div>
      </header>

      {/* Grid Container */}
      <div 
        className="w-full bg-white rounded-xl shadow-sm border border-slate-300 p-2 sm:p-4 mb-4 flex-1 flex flex-col"
        onDragLeave={(e) => {
          const related = e.relatedTarget as Node | null;
          if (!e.currentTarget.contains(related)) {
            setActiveZone(null);
          }
        }}
      >
        
        {/* Header Row (Instruments) */}
        <div className="flex w-full border-b-2 border-slate-800 pb-2 mb-2">
          <div className="flex-1 w-0 min-w-[80px] shrink-0 font-bold text-slate-400 uppercase text-[10px] md:text-xs flex items-end px-1 sm:px-2">
            Ensemble
          </div>
          {INSTRUMENTS.map(instrument => {
            const isActiveInstrument = activeZone?.instrument === instrument;
            return (
              <div 
                key={instrument} 
                title={instrument} 
                className={`flex-1 w-0 text-[9px] sm:text-xs md:text-sm px-0.5 text-center truncate transition-all duration-200 ${isActiveInstrument ? 'text-blue-600 font-extrabold scale-110' : 'text-slate-700 font-bold'}`}
              >
                {instrument}
              </div>
            );
          })}
        </div>

        {/* Matrix Rows (Bands) */}
        <div className="flex flex-col flex-1 w-full">
          {bands.map((band) => (
            <div key={band.name} className="flex w-full border-b border-slate-300 last:border-0 hover:bg-slate-50 transition-colors">
              
              {/* Row Header */}
              <div className="flex-1 w-0 min-w-[80px] shrink-0 py-2 sm:py-4 pr-1 sm:pr-2 flex flex-col sm:flex-row items-start sm:items-center gap-1 sm:gap-2 border-r border-slate-300 px-1 sm:px-2">
                <div className="relative group/picker cursor-pointer w-4 h-4 sm:w-6 sm:h-6 rounded overflow-hidden shadow-sm border border-black/20 shrink-0">
                  <input 
                    type="color" 
                    value={band.color} 
                    onChange={(e) => handleColorChange(band.name, e.target.value)}
                    className="absolute -top-2 -left-2 w-10 h-10 cursor-pointer"
                    title="Change Band Color"
                  />
                </div>
                <span 
                  className={`text-[10px] sm:text-xs md:text-sm truncate w-full transition-colors duration-200 ${activeZone?.band === band.name ? 'text-blue-600 font-extrabold' : 'text-slate-800 font-semibold'}`} 
                  title={band.name}
                >
                  {band.name}
                </span>
              </div>

              {/* Drop Zones (Cells) */}
              {INSTRUMENTS.map((instrument) => {
                const cellStudents = students
                  .filter(s => s.band === band.name && s.instrument === instrument)
                  .sort((a, b) => {
                    const posA = a.position ?? 0;
                    const posB = b.position ?? 0;
                    return posA !== posB ? posA - posB : a.id.localeCompare(b.id);
                  });

                const isCellActive = activeZone?.band === band.name && activeZone?.instrument === instrument;

                return (
                  <div
                    key={`${band.name}-${instrument}`}
                    className={`group/cell flex-1 w-0 min-h-[60px] border-r border-slate-300 last:border-r-0 flex flex-col relative pt-1 pb-6 px-0.5 sm:px-2 transition-all duration-200 ${isCellActive ? 'bg-blue-50 ring-2 ring-blue-400 ring-inset' : ''}`}
                    onDragOver={(e) => {
                      handleDragOver(e);
                      if (activeZone?.band !== band.name || activeZone?.instrument !== instrument) {
                        setActiveZone({ band: band.name, instrument });
                      }
                    }}
                    onDrop={(e) => handleCellDrop(e, band.name, instrument)}
                  >

                    {cellStudents.map((student, index) => (
                      <StudentCard 
                        key={student.id} 
                        student={student} 
                        color={band.color}
                        prevPos={index > 0 ? cellStudents[index - 1].position ?? 0 : null}
                        nextPos={index < cellStudents.length - 1 ? cellStudents[index + 1].position ?? 0 : null}
                        draggedStudentId={draggedStudentId}
                        onDragStart={handleDragStart} 
                        onDragEnd={handleDragEnd}
                        onReorder={(noteId, newPos) => handleReorder(noteId, band.name, instrument, newPos)}
                        onEditName={handleNameEdit} 
                        onCycleGrade={handleCycleGrade}
                      />
                    ))}

                    <button
                      onClick={() => handleAddStudent(band.name, instrument)}
                      title="Add Student"
                      className="absolute bottom-1 right-1 w-4 h-4 sm:w-5 sm:h-5 rounded-full border border-dashed border-slate-400 text-slate-400 hover:text-slate-700 hover:border-slate-500 hover:bg-slate-100 transition-all flex items-center justify-center text-sm sm:text-lg leading-none pb-0.5 opacity-0 group-hover/cell:opacity-100"
                    >
                      +
                    </button>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {draggedStudentId && (
        <div 
          onDragEnter={() => setActiveZone(null)}
          onDragOver={handleDragOver} 
          onDrop={handleDeleteDrop}
          className="w-full h-20 border-2 border-dashed border-red-300 bg-red-50 text-red-500 rounded-xl flex items-center justify-center font-bold text-lg shadow-inner transition-colors hover:bg-red-100 hover:border-red-400 flex-shrink-0"
        >
          🗑️ Drop Student Here to Delete
        </div>
      )}

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
        <h2 className="text-2xl font-bold text-center text-slate-800 mb-6">Top Secret</h2>
        {error && <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm mb-4 border border-red-200">{error}</div>}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="w-full p-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"/>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
            <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="w-full p-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"/>
          </div>
          <button type="submit" disabled={loading} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 rounded-lg transition-colors mt-2 disabled:opacity-50">
            {loading ? 'Processing...' : 'Sign In'}
          </button>
        </form>
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
  prevPos: number | null;
  nextPos: number | null;
  draggedStudentId: string | null;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onDragEnd: () => void;
  onReorder: (id: string, newPos: number) => void;
  onEditName: (id: string, newName: string) => void;
  onCycleGrade: (id: string, currentGrade: GradeLevel) => void;
}

function StudentCard({ student, color, prevPos, nextPos, draggedStudentId, onDragStart, onDragEnd, onReorder, onEditName, onCycleGrade }: StudentCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(student.name);
  const [dropIndicator, setDropIndicator] = useState<'top' | 'bottom' | null>(null);
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

  // --- Card Reordering Drop Handlers ---
  const handleDragOver = (e: React.DragEvent) => {
    if (isEditing) return;
    e.preventDefault();
    e.stopPropagation(); // VERY IMPORTANT: Stops the parent cell from grabbing it!
    
    // Calculate if we are hovering the top half or bottom half of the card
    const rect = e.currentTarget.getBoundingClientRect();
    const midPointY = rect.top + rect.height / 2;
    setDropIndicator(e.clientY < midPointY ? 'top' : 'bottom');
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation(); // VERY IMPORTANT: Stops the parent cell from grabbing it!
    const side = dropIndicator;
    setDropIndicator(null);

    const incomingStudentId = e.dataTransfer.getData('text/plain') || draggedStudentId;
    if (!incomingStudentId || incomingStudentId === student.id) return; 

    // Calculate a safe position, ensuring no zeros clash
    const currentPos = student.position ?? 0;
    const pPos = prevPos !== null ? prevPos : currentPos - 1000;
    const nPos = nextPos !== null ? nextPos : currentPos + 1000;

    let newPos: number;
    if (side === 'top') {
      newPos = pPos === currentPos ? currentPos - 500 : (pPos + currentPos) / 2;
    } else {
      newPos = nPos === currentPos ? currentPos + 500 : (nPos + currentPos) / 2;
    }
    
    onReorder(incomingStudentId, newPos);
  };

  return (
    // This wrapper handles the visual gap via py-1 so there are no dead spaces to hover!
    <div 
      className="relative py-1 w-full"
      onDragOver={handleDragOver}
      onDragLeave={() => setDropIndicator(null)}
      onDrop={handleDrop}
    >
      {/* Drop Indicator Lines rendered perfectly inside the visual padding */}
      {dropIndicator === 'top' && <div className="absolute top-0 left-0 right-0 h-1 bg-blue-600 rounded-full z-50 pointer-events-none" />}
      {dropIndicator === 'bottom' && <div className="absolute bottom-0 left-0 right-0 h-1 bg-blue-600 rounded-full z-50 pointer-events-none" />}

      <div
        draggable={!isEditing}
        onDragStart={(e) => onDragStart(e, student.id)}
        onDragEnd={onDragEnd}
        onDoubleClick={() => setIsEditing(true)}
        style={{ backgroundColor: color }}
        className="group relative flex items-center justify-between p-1 sm:p-1.5 px-1.5 sm:px-2 rounded-md shadow-sm border border-black/10 cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow z-10 w-full"
      >
        <button 
          onClick={handleGradeClick}
          title="Click to change grade"
          className="absolute -top-1.5 -left-1 sm:-left-1.5 bg-slate-800 hover:bg-slate-600 text-white text-[9px] sm:text-[10px] font-bold w-3 h-3 sm:w-4 sm:h-4 rounded-full flex items-center justify-center shadow-sm cursor-pointer transition-colors"
        >
          {student.grade}
        </button>

        {isEditing ? (
          <input
            ref={inputRef} value={editValue} onChange={(e) => setEditValue(e.target.value)}
            onBlur={handleBlurOrSubmit} onKeyDown={handleKeyDown}
            className="w-full text-[10px] sm:text-xs font-medium bg-white/70 border border-black/20 rounded px-1 outline-none"
          />
        ) : (
          <span className="text-[10px] sm:text-xs font-medium text-slate-800 truncate ml-1 sm:ml-2 leading-tight">{student.name}</span>
        )}
      </div>
    </div>
  );
}
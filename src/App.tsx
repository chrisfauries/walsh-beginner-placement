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
  color?: string; 
  previousBand?: string; 
  comment?: string; 
}

interface Band {
  name: string;
  color: string;
}

const DEFAULT_BANDS: Band[] = [
  { name: 'Confirmed', color: '#dcfce7' }, 
  { name: '1st Choice', color: '#fef08a' }, 
  { name: '2nd Choice', color: '#fed7aa' }, 
  { name: '3rd Choice', color: '#bae6fd' }, 
  { name: 'Feedback', color: '#f3f4f6' }, 
];

const INSTRUMENTS = [
  'Flute', 'Oboe', 'Bassoon','Clarinet', 'Saxophone', 
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
  
  // --- Search State ---
  const [searchTerm, setSearchTerm] = useState('');

  // --- Context Menu State ---
  const [contextMenu, setContextMenu] = useState<{mouseX: number, mouseY: number, studentId: string} | null>(null);
  const [isMainMenuOpen, setIsMainMenuOpen] = useState(false);

  // --- Modal States ---
  const [isClearModalOpen, setIsClearModalOpen] = useState(false);
  const [isAddRecruitOpen, setIsAddRecruitOpen] = useState(false);
  const [feedbackModalData, setFeedbackModalData] = useState<{band: string, instrument: string} | null>(null);

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

  // Derive which names are in the "Confirmed" row for gray-out logic
  const confirmedNames = new Set(
    students
      .filter(s => s.band === 'Confirmed')
      .map(s => s.name.toLowerCase().trim())
  );

  const handleAddRecruit = async (name: string, grade: GradeLevel, choices: string[]) => {
    const updates: any = {};
    const rowNames = ['1st Choice', '2nd Choice', '3rd Choice'];
    
    choices.forEach((instrument, index) => {
      if (instrument) { 
        const newKey = push(ref(db, 'students')).key;
        updates[`students/${newKey}`] = { 
          name: name.trim(), 
          instrument, 
          band: rowNames[index], 
          grade: grade,
          position: Date.now() + index 
        };
      }
    });
    
    await update(ref(db), updates);
    setIsAddRecruitOpen(false);
  };

  const submitFeedbackStudent = async (name: string, grade: GradeLevel, comment: string) => {
    if (!feedbackModalData || !name.trim()) return;
    
    const { band, instrument } = feedbackModalData;
    const cellStudents = students.filter(s => s.band === band && s.instrument === instrument);
    const maxPos = cellStudents.length > 0 ? Math.max(...cellStudents.map(s => s.position ?? 0)) : 0;
    
    await push(ref(db, 'students'), { 
      name: name.trim(), 
      instrument, 
      band, 
      grade,
      comment: comment.trim() || null,
      position: maxPos + 1000 
    });
    
    setFeedbackModalData(null);
  };

  const handleColorChange = async (bandName: string, newColor: string) => {
    await update(ref(db, `bands/${bandName}`), { color: newColor });
  };

  const handleUpdateComment = async (id: string, comment: string) => {
    await update(ref(db, `students/${id}`), { comment: comment.trim() });
  };

  // --- Context Menu Handlers ---
  const handleContextMenu = (e: React.MouseEvent, studentId: string) => {
    e.preventDefault();
    setContextMenu({
      mouseX: e.clientX,
      mouseY: e.clientY,
      studentId: studentId
    });
  };

  const closeContextMenu = () => {
    setContextMenu(null);
  };

  const handleMoveToConfirmed = async (student: Student) => {
    await update(ref(db, `students/${student.id}`), {
      band: 'Confirmed',
      previousBand: student.band
    });
    closeContextMenu();
  };

  const handleMoveToPrevious = async (student: Student) => {
    await update(ref(db, `students/${student.id}`), {
      band: student.previousBand,
      previousBand: null
    });
    closeContextMenu();
  };

  const handleDeleteStudent = async (studentId: string) => {
    const studentToDelete = students.find(s => s.id === studentId);
    if (!studentToDelete) {
      closeContextMenu();
      return;
    }
    
    if (studentToDelete.band === 'Feedback') {
      // If it's a feedback entry, only delete this specific entry
      await remove(ref(db, `students/${studentId}`));
    } else {
      // Otherwise, delete all instances of this student across choices/confirmed
      const targetName = studentToDelete.name.toLowerCase().trim();
      const updates: any = {};
      
      students.forEach(s => {
        if (s.name.toLowerCase().trim() === targetName) {
          updates[`students/${s.id}`] = null;
        }
      });
      
      await update(ref(db), updates);
    }
    closeContextMenu();
  };

  // --- Export CSV ---
  const handleExportCSV = () => {
    const headers = ['Name', 'Instrument', 'Band', 'Grade', 'Position', 'Comment'];
    const sortedStudents = [...students].sort((a, b) => {
      if (a.band !== b.band) return a.band.localeCompare(b.band);
      if (a.instrument !== b.instrument) return a.instrument.localeCompare(b.instrument);
      
      const isGrayA = a.band !== 'Confirmed' && confirmedNames.has(a.name.toLowerCase().trim());
      const isGrayB = b.band !== 'Confirmed' && confirmedNames.has(b.name.toLowerCase().trim());
      if (isGrayA !== isGrayB) return isGrayA ? 1 : -1;

      return a.name.localeCompare(b.name);
    });

    const rows = sortedStudents.map(s => `"${s.name}","${s.instrument}","${s.band}","${s.grade}","${s.position ?? 0}","${(s.comment || '').replace(/"/g, '""')}"`);
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

  if (loadingAuth) return <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-500">Loading...</div>;
  if (!user) return <AuthScreen />;

  const contextMenuStudent = contextMenu ? students.find(s => s.id === contextMenu.studentId) : null;

  return (
    <div className="min-h-screen bg-slate-50 p-2 sm:p-4 font-sans text-slate-800 pb-12 flex flex-col relative">
      
      {/* Modals */}
      {isAddRecruitOpen && (
        <AddRecruitModal 
          onClose={() => setIsAddRecruitOpen(false)} 
          onSubmit={handleAddRecruit} 
        />
      )}
      
      {feedbackModalData && (
        <AddFeedbackModal
          onClose={() => setFeedbackModalData(null)}
          onSubmit={submitFeedbackStudent}
        />
      )}

      {/* Context Menu Overlay & Menu */}
      {contextMenu && contextMenuStudent && (
        <>
          <div 
            className="fixed inset-0 z-40" 
            onClick={closeContextMenu} 
            onContextMenu={(e) => { e.preventDefault(); closeContextMenu(); }} 
          />
          <div 
            className="fixed z-50 bg-white rounded-lg shadow-xl border border-slate-200 py-1 min-w-[160px] flex flex-col overflow-hidden"
            style={{ top: contextMenu.mouseY, left: contextMenu.mouseX }}
          >
            {contextMenuStudent.band !== 'Confirmed' && contextMenuStudent.band !== 'Feedback' && (
              <button 
                className="w-full text-left px-4 py-2 text-sm text-green-600 font-bold hover:bg-green-50 transition-colors"
                onClick={() => handleMoveToConfirmed(contextMenuStudent)}
              >
                Confirm this Choice
              </button>
            )}
            
            {contextMenuStudent.band === 'Confirmed' && contextMenuStudent.previousBand && (
              <button 
                className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 transition-colors"
                onClick={() => handleMoveToPrevious(contextMenuStudent)}
              >
                Move back to {contextMenuStudent.previousBand}
              </button>
            )}
            
            <button 
              className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
              onClick={() => handleDeleteStudent(contextMenu.studentId)}
            >
              {contextMenuStudent.band === 'Feedback' ? 'Delete Feedback' : 'Delete Student'}
            </button>
          </div>
        </>
      )}

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

      {/* Compact Header & Hamburger Menu */}
      <header className="mb-2 flex flex-row items-center justify-between bg-white p-1 rounded-xl shadow-sm border border-slate-300 relative z-30">
        <button 
          onClick={() => setIsAddRecruitOpen(true)}
          className="w-10 h-10 flex items-center justify-center bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm ml-1"
          title="Add New Recruit"
        >
          <span className="text-2xl font-bold">+</span>
        </button>

        <h1 className="text-lg font-bold text-slate-900 hidden sm:block">Band Placement</h1>
        
        <div className="flex items-center gap-2">
          {/* Search Bar */}
          <div className="relative flex items-center">
            <svg className="w-4 h-4 absolute left-2.5 text-slate-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input 
              type="text" 
              placeholder="Search..." 
              value={searchTerm} 
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-8 pr-3 py-1.5 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 w-32 sm:w-48 bg-slate-50 hover:bg-white transition-colors"
            />
          </div>

          <button 
            onClick={() => setIsMainMenuOpen(!isMainMenuOpen)}
            className="p-1.5 hover:bg-slate-100 rounded-md transition-colors text-slate-600"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>

        {isMainMenuOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setIsMainMenuOpen(false)} />
            <div className="absolute right-4 top-14 z-50 bg-white rounded-lg shadow-xl border border-slate-200 py-1 min-w-[160px] flex flex-col overflow-hidden">
              <button 
                onClick={() => {
                  handleExportCSV();
                  setIsMainMenuOpen(false);
                }} 
                className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 transition-colors"
              >
                Export CSV
              </button>
              <button 
                onClick={() => {
                  setIsClearModalOpen(true);
                  setIsMainMenuOpen(false);
                }} 
                className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
              >
                Clear Board
              </button>
              <div className="border-t border-slate-200 my-1"></div>
              <button 
                onClick={() => {
                  signOut(auth);
                  setIsMainMenuOpen(false);
                }} 
                className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 transition-colors"
              >
                Sign Out
              </button>
            </div>
          </>
        )}
      </header>

      {/* Grid Container */}
      <div className="w-full bg-white rounded-xl shadow-sm border border-slate-300 mb-4 flex-1 flex flex-col relative">
        <div className="min-w-max flex flex-col flex-1">
          {/* Header Row (Instruments) */}
          <div className="flex w-full border-b-2 border-slate-800 sticky top-0 z-20 bg-white shadow-sm">
            <div className="w-10 min-w-[40px] max-w-[40px] shrink-0 sticky left-0 z-30 bg-white border-r border-slate-300">
              {/* Empty intersection cell */}
            </div>
            {INSTRUMENTS.map(instrument => {
              const confirmedCount = students.filter(s => s.band === 'Confirmed' && s.instrument === instrument).length;
              return (
                <div 
                  key={instrument} 
                  title={instrument} 
                  className="flex-1 w-0 min-w-[160px] text-[9px] sm:text-xs md:text-sm px-0.5 py-3 text-center truncate transition-all duration-200 flex items-center justify-center text-slate-700 font-bold"
                >
                  {instrument} ({confirmedCount})
                </div>
              );
            })}
          </div>

          {/* Matrix Rows (Bands) */}
          <div className="flex flex-col flex-1 w-full">
            {bands.map((band) => {
              const bandStudentsCount = students.filter(s => s.band === band.name).length;
              
              return (
              <div key={band.name} className="group flex w-full border-b border-slate-300 last:border-0 hover:bg-slate-50 transition-colors">
                
                {/* Row Header (Vertical with adjacent color picker) */}
                <div className="w-10 min-w-[40px] max-w-[40px] shrink-0 py-2 flex items-center justify-center border-r border-slate-300 sticky left-0 z-20 bg-white group-hover:bg-slate-50 transition-colors">
                  <div className="flex flex-col-reverse items-center justify-center gap-1.5 h-full">
                    <div className="relative group/picker cursor-pointer w-3 h-3 sm:w-3.5 sm:h-3.5 rounded overflow-hidden shadow-sm border border-black/20 shrink-0">
                      <input 
                        type="color" 
                        value={band.color} 
                        onChange={(e) => handleColorChange(band.name, e.target.value)}
                        className="absolute -top-2 -left-2 w-8 h-8 cursor-pointer"
                        title="Change Row Color"
                      />
                    </div>
                    <span 
                      className="text-[10px] sm:text-xs md:text-sm whitespace-nowrap transition-colors duration-200 [writing-mode:vertical-rl] rotate-180 text-slate-800 font-semibold" 
                      title={band.name}
                    >
                      {band.name} <span className="font-normal text-slate-500 ml-1">({bandStudentsCount})</span>
                    </span>
                  </div>
                </div>

                {/* Cells */}
                {INSTRUMENTS.map((instrument) => {
                  const cellStudents = students
                    .filter(s => s.band === band.name && s.instrument === instrument)
                    .sort((a, b) => {
                      const isGrayA = band.name !== 'Confirmed' && confirmedNames.has(a.name.toLowerCase().trim());
                      const isGrayB = band.name !== 'Confirmed' && confirmedNames.has(b.name.toLowerCase().trim());
                      
                      // Sort grayed out to the bottom
                      if (isGrayA !== isGrayB) return isGrayA ? 1 : -1;
                      
                      // Sort alphabetically by first name
                      return a.name.localeCompare(b.name);
                    });

                  return (
                    <div
                      key={`${band.name}-${instrument}`}
                      className="group/cell flex-1 w-0 min-w-[160px] min-h-[60px] border-r border-slate-300 last:border-r-0 flex flex-col relative pt-1 pb-6 px-0.5 sm:px-2 transition-all duration-200"
                    >
                      {cellStudents.map((student) => {
                        const isSearchMatch = searchTerm.trim() !== '' && student.name.toLowerCase().includes(searchTerm.toLowerCase());
                        const isSearchHidden = searchTerm.trim() !== '' && !isSearchMatch;
                        
                        // Hide non-matching tags completely
                        if (isSearchHidden) return null;

                        const isGrayedOut = band.name !== 'Confirmed' && confirmedNames.has(student.name.toLowerCase().trim());
                        
                        return (
                          <StudentCard 
                            key={student.id} 
                            student={student} 
                            color={student.color || band.color}
                            isGrayedOut={isGrayedOut}
                            isSearchMatch={isSearchMatch}
                            onUpdateComment={handleUpdateComment}
                            onContextMenu={handleContextMenu}
                          />
                        );
                      })}

                      {/* Display free-add '+' button ONLY in Feedback row */}
                      {band.name === 'Feedback' && (
                        <button
                          onClick={() => setFeedbackModalData({ band: band.name, instrument })}
                          title="Add Feedback Entry"
                          className="absolute bottom-1 right-1 w-4 h-4 sm:w-5 sm:h-5 rounded-full border border-dashed border-slate-400 text-slate-400 hover:text-slate-700 hover:border-slate-500 hover:bg-slate-100 transition-all flex items-center justify-center text-sm sm:text-lg leading-none pb-0.5 opacity-0 group-hover/cell:opacity-100"
                        >
                          +
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// ADD RECRUIT MODAL SUB-COMPONENT
// ==========================================
function AddRecruitModal({ onClose, onSubmit }: { onClose: () => void, onSubmit: (name: string, grade: GradeLevel, choices: string[]) => void }) {
  const [name, setName] = useState('');
  const [grade, setGrade] = useState<GradeLevel>('6');
  const [c1, setC1] = useState(INSTRUMENTS[0]);
  const [c2, setC2] = useState('');
  const [c3, setC3] = useState('');

  const choicesData = [
    { label: '1st Choice Instrument', value: c1, setter: setC1, required: true },
    { label: '2nd Choice Instrument', value: c2, setter: setC2, required: false },
    { label: '3rd Choice Instrument', value: c3, setter: setC3, required: false },
  ];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-lg max-w-md w-full p-6">
        <h3 className="text-xl font-bold mb-4">Add New Recruit</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Student Name</label>
            <input 
              value={name} 
              onChange={e => setName(e.target.value)} 
              className="w-full border p-2 rounded focus:ring-2 focus:ring-blue-500 outline-none" 
              placeholder="Enter name..." 
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Grade Level</label>
            <div className="flex gap-4">
              {(['6', '7', '8'] as GradeLevel[]).map(g => (
                <label key={g} className="flex items-center gap-1.5 cursor-pointer">
                  <input 
                    type="radio" 
                    name="grade" 
                    value={g} 
                    checked={grade === g} 
                    onChange={() => setGrade(g)} 
                    className="w-4 h-4 text-blue-600" 
                  />
                  <span className="text-sm font-medium">{g}</span>
                </label>
              ))}
            </div>
          </div>

          {choicesData.map((choice, i) => (
            <div key={i}>
              <label className="block text-sm font-medium mb-1">{choice.label}</label>
              <select 
                value={choice.value} 
                onChange={e => choice.setter(e.target.value)} 
                className="w-full border p-2 rounded"
              >
                {!choice.required && <option value="">-- Optional --</option>}
                {INSTRUMENTS.map(ins => {
                  const isSelectedElsewhere = (i !== 0 && ins === c1) || (i !== 1 && ins === c2) || (i !== 2 && ins === c3);
                  return <option key={ins} value={ins} disabled={isSelectedElsewhere}>{ins}</option>;
                })}
              </select>
            </div>
          ))}
          <div className="flex justify-end gap-3 mt-6">
            <button onClick={onClose} className="px-4 py-2 text-slate-600 font-medium">Cancel</button>
            <button 
              disabled={!name.trim() || !c1} 
              onClick={() => onSubmit(name, grade, [c1, c2, c3])} 
              className="px-6 py-2 bg-blue-600 text-white rounded-lg font-bold disabled:opacity-50 hover:bg-blue-700 transition-colors"
            >
              Add to Choices
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// ADD FEEDBACK MODAL SUB-COMPONENT
// ==========================================
function AddFeedbackModal({ onClose, onSubmit }: { onClose: () => void, onSubmit: (name: string, grade: GradeLevel, comment: string) => void }) {
  const [name, setName] = useState('');
  const [grade, setGrade] = useState<GradeLevel>('6');
  const [comment, setComment] = useState('');

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-lg max-w-md w-full p-6">
        <h3 className="text-xl font-bold mb-4">Add Feedback Entry</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Student Name</label>
            <input 
              value={name} 
              onChange={e => setName(e.target.value)} 
              className="w-full border p-2 rounded focus:ring-2 focus:ring-blue-500 outline-none" 
              placeholder="Enter name..." 
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Grade Level</label>
            <div className="flex gap-4">
              {(['6', '7', '8'] as GradeLevel[]).map(g => (
                <label key={g} className="flex items-center gap-1.5 cursor-pointer">
                  <input 
                    type="radio" 
                    name="grade" 
                    value={g} 
                    checked={grade === g} 
                    onChange={() => setGrade(g)} 
                    className="w-4 h-4 text-blue-600" 
                  />
                  <span className="text-sm font-medium">{g}</span>
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Comment</label>
            <textarea 
              value={comment} 
              onChange={e => setComment(e.target.value)} 
              className="w-full border p-2 rounded focus:ring-2 focus:ring-blue-500 outline-none resize-none" 
              placeholder="Add feedback comment..."
              rows={3}
            />
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <button onClick={onClose} className="px-4 py-2 text-slate-600 font-medium">Cancel</button>
            <button 
              disabled={!name.trim()} 
              onClick={() => onSubmit(name, grade, comment)} 
              className="px-6 py-2 bg-blue-600 text-white rounded-lg font-bold disabled:opacity-50 hover:bg-blue-700 transition-colors"
            >
              Add Feedback
            </button>
          </div>
        </div>
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
  isGrayedOut?: boolean;
  isSearchMatch?: boolean;
  onUpdateComment: (id: string, comment: string) => void;
  onContextMenu: (e: React.MouseEvent, id: string) => void;
}

function StudentCard({ student, color, isGrayedOut, isSearchMatch, onUpdateComment, onContextMenu }: StudentCardProps) {
  const [isEditingComment, setIsEditingComment] = useState(false);
  const [commentValue, setCommentValue] = useState(student.comment || '');
  const [showTooltip, setShowTooltip] = useState(false);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isEditingComment && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.selectionStart = inputRef.current.value.length;
    }
  }, [isEditingComment]);

  const handleMouseEnter = (e: React.MouseEvent) => {
    if (!student.comment) return;
    setMousePos({ x: e.clientX, y: e.clientY });
    hoverTimeoutRef.current = setTimeout(() => {
      setShowTooltip(true);
    }, 100);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (student.comment && !showTooltip) {
      setMousePos({ x: e.clientX, y: e.clientY });
    }
  };

  const handleMouseLeave = () => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    setShowTooltip(false);
  };

  const handleDoubleClick = () => {
    setIsEditingComment(true);
    setShowTooltip(false);
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
  };

  const handleBlurOrSubmit = () => {
    setIsEditingComment(false);
    if (commentValue !== (student.comment || '')) {
      onUpdateComment(student.id, commentValue);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleBlurOrSubmit();
    }
    if (e.key === 'Escape') {
      setCommentValue(student.comment || '');
      setIsEditingComment(false);
    }
  };

  return (
    <div 
      className="relative py-1 w-full"
      onContextMenu={(e) => onContextMenu(e, student.id)}
      onMouseEnter={handleMouseEnter}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {/* Absolute Hover Tooltip fixed to mouse position */}
      {showTooltip && student.comment && !isEditingComment && (
        <div 
          className="fixed z-50 bg-yellow-100 border border-yellow-300 text-yellow-900 text-xs p-1.5 rounded shadow-lg whitespace-pre-wrap break-words min-w-[120px] max-w-[250px] pointer-events-none"
          style={{ top: mousePos.y + 15, left: mousePos.x }}
        >
          {student.comment}
        </div>
      )}

      <div
        style={{ 
          backgroundColor: color,
          ...(isGrayedOut ? { backgroundImage: 'repeating-linear-gradient(45deg, rgba(0,0,0,0.05), rgba(0,0,0,0.05) 4px, transparent 4px, transparent 8px)' } : {})
        }}
        className={`group relative flex items-center justify-between p-1 sm:p-1.5 px-1.5 sm:px-2 rounded-md transition-all z-10 w-full 
          ${isGrayedOut ? 'opacity-40 grayscale-[0.5]' : ''} 
          ${isSearchMatch ? 'border-blue-500 ring-2 ring-blue-400 shadow-[0_0_12px_rgba(59,130,246,0.6)]' : 'border border-black/10 shadow-sm hover:shadow-md'}
        `}
        onDoubleClick={handleDoubleClick}
      >
        <span className="absolute -top-1.5 -right-1 sm:-right-1.5 bg-slate-400 text-white text-[9px] sm:text-[10px] font-bold w-3 h-3 sm:w-4 sm:h-4 rounded-full flex items-center justify-center shadow-sm">
          {student.grade}
        </span>

        {isEditingComment ? (
          <textarea
            ref={inputRef}
            value={commentValue}
            onChange={(e) => setCommentValue(e.target.value)}
            onBlur={handleBlurOrSubmit}
            onKeyDown={handleKeyDown}
            className="w-full text-[10px] sm:text-xs font-medium bg-white border border-blue-400 rounded px-1 py-0.5 outline-none resize-none overflow-hidden min-h-[40px] pr-3 sm:pr-4"
            placeholder="Add comment..."
            rows={2}
          />
        ) : (
          <span className="text-[10px] sm:text-xs font-medium text-slate-800 truncate leading-tight mr-3 sm:mr-4 select-none">
            {student.name}
          </span>
        )}
      </div>
    </div>
  );
}
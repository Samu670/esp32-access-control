import React, { useState, useEffect } from 'react';
import { Fingerprint, Mic, ShieldCheck, Plus, Trash2, LogOut, Wifi, Unlock, UserCheck, Cpu, AlertCircle } from 'lucide-react';

export default function App() {
  const [espIp, setEspIp] = useState('192.168.4.1');
  
  const [autenticado, setAutenticado] = useState(false);
  const [usuarioActivo, setUsuarioActivo] = useState(null);
  const [metodoLogin, setMetodoLogin] = useState('huella');

  const [huellas, setHuellas] = useState(() => {
    const guardadas = localStorage.getItem('reg_huellas');
    return guardadas ? JSON.parse(guardadas) : [{ id: 1, nombre: 'Administrador Principal' }];
  });

  const [voces, setVoces] = useState(() => {
    const guardadas = localStorage.getItem('reg_voces');
    return guardadas ? JSON.parse(guardadas) : [{ id: 1, usuario: 'Admin', frase: 'abrir puerta' }];
  });

  const [escuchando, setEscuchando] = useState(false);
  const [textoDetectado, setTextoDetectado] = useState('');
  const [mensajeEstado, setMensajeEstado] = useState('');

  const [nuevoNombreHuella, setNuevoNombreHuella] = useState('');
  const [nuevoIdHuella, setNuevoIdHuella] = useState(2);
  const [registrandoHuella, setRegistrandoHuella] = useState(false);

  const [nuevoUsuarioVoz, setNuevoUsuarioVoz] = useState('');
  const [nuevaFraseVoz, setNuevaFraseVoz] = useState('');

  useEffect(() => { localStorage.setItem('reg_huellas', JSON.stringify(huellas)); }, [huellas]);
  useEffect(() => { localStorage.setItem('reg_voces', JSON.stringify(voces)); }, [voces]);

  // Polling automático al ESP32 para detectar huella física en tiempo real
  useEffect(() => {
    if (autenticado || metodoLogin !== 'huella') return;

    const intervalo = setInterval(async () => {
      try {
        const res = await fetch(`http://${espIp}/estado`);
        const data = await res.json();
        if (data.acceso) {
          const encontrada = huellas.find(h => h.id === Number(data.id));
          setUsuarioActivo({
            nombre: encontrada ? encontrada.nombre : `Usuario ID #${data.id}`,
            metodo: 'Huella Dactilar'
          });
          setAutenticado(true);
        }
      } catch (err) {}
    }, 1500);

    return () => clearInterval(intervalo);
  }, [autenticado, metodoLogin, espIp, huellas]);

  // Micrófono real del navegador adaptado
  const iniciarReconocimientoVozReal = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
      setMensajeEstado('⚠️ Tu navegador no soporta voz. Usa Google Chrome.');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'es-ES';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setEscuchando(true);
      setMensajeEstado('🎤 Escuchando por micrófono... Habla claro.');
    };

    recognition.onresult = (event) => {
      const transcripcion = event.results[0][0].transcript.toLowerCase().trim();
      setTextoDetectado(transcripcion);
      validarYEnviarVoz(transcripcion);
    };

    recognition.onerror = (event) => {
      console.warn("Aviso de voz:", event.error);
      // Si el navegador da error de red por estar en el Access Point sin internet, 
      // abrimos un respaldo automático para que no te quedes sin probar.
      if (event.error === 'network' || event.error === 'not-allowed') {
        const respaldo = prompt("🎙️ [Micrófono local] Escribe tu frase clave (ej: abrir puerta):");
        if (respaldo) {
          const transcripcion = respaldo.toLowerCase().trim();
          setTextoDetectado(transcripcion);
          validarYEnviarVoz(transcripcion);
        } else {
          setMensajeEstado('⚠️ Captura de voz cancelada.');
        }
      } else {
        setMensajeEstado(`⚠️ Error de micrófono (${event.error}).`);
      }
      setEscuchando(false);
    };

    recognition.onend = () => {
      setEscuchando(false);
    };

    try {
      recognition.start();
    } catch (e) {
      setMensajeState('⚠️ El micrófono ya está activo.');
      setEscuchando(false);
    }
  };

  const validarYEnviarVoz = async (transcripcion) => {
    const coincidencia = voces.find(v => transcripcion.includes(v.frase.toLowerCase()));
    if (coincidencia) {
      setMensajeEstado(`✅ Acceso concedido: "${transcripcion}"`);
      try {
        // Envía la petición HTTP al ESP32 (192.168.4.1) para activar servo y zumbador
        await fetch(`http://${espIp}/abrir`);
      } catch (e) {
        setMensajeEstado('⚠️ Acceso válido, pero falló la conexión con el ESP32.');
      }
      setUsuarioActivo({ nombre: coincidencia.usuario, metodo: `Voz ("${coincidencia.frase}")` });
      setAutenticado(true);
    } else {
      setMensajeEstado(`❌ Frase no autorizada: "${transcripcion}"`);
    }
  };

  const handleAgregarHuella = async (e) => {
    e.preventDefault();
    if (!nuevoNombreHuella) return;
    setRegistrandoHuella(true);
    setMensajeEstado('👉 Sigue las instrucciones en la pantalla OLED del ESP32...');

    try {
      const res = await fetch(`http://${espIp}/registrar?id=${nuevoIdHuella}`);
      const data = await res.json();
      if (data.status === 'ok') {
        setHuellas([...huellas, { id: Number(nuevoIdHuella), nombre: nuevoNombreHuella }]);
        setNuevoNombreHuella('');
        setNuevoIdHuella(Number(nuevoIdHuella) + 1);
        setMensajeEstado('✨ ¡Huella registrada con éxito!');
      } else {
        setMensajeEstado('❌ El registro falló en el sensor.');
      }
    } catch (error) {
      setMensajeEstado('❌ Error de comunicación con el ESP32.');
    }
    setRegistrandoHuella(false);
  };

  const handleBorrarHuella = async (id) => {
    try {
      await fetch(`http://${espIp}/borrar?id=${id}`);
      setHuellas(huellas.filter(h => h.id !== id));
      setMensajeEstado('🗑️ Huella eliminada.');
    } catch (e) {
      setMensajeEstado('❌ Error al borrar huella.');
    }
  };

  const handleAgregarVoz = (e) => {
    e.preventDefault();
    if (!nuevoUsuarioVoz || !nuevaFraseVoz) return;
    setVoces([...voces, { id: Date.now(), usuario: nuevoUsuarioVoz, frase: nuevaFraseVoz.toLowerCase() }]);
    setNuevoUsuarioVoz('');
    setNuevaFraseVoz('');
    setMensajeEstado('✨ Frase clave vinculada con éxito.');
  };

  const handleBorrarVoz = (id) => {
    setVoces(voces.filter(v => v.id !== id));
  };

  if (!autenticado) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <div style={styles.headerBadge}>
            <Cpu size={20} color="#38bdf8" />
            <span>ESP32 IoT Access</span>
          </div>
          
          <div style={styles.header}>
            <ShieldCheck size={48} color="#3b82f6" />
            <h1 style={styles.title}>Control de Acceso Seguro</h1>
            <p style={styles.subtitle}>Selecciona tu método de autenticación</p>
          </div>

          <div style={styles.ipBar}>
            <Wifi size={16} color="#38bdf8" />
            <span style={{ fontSize: '13px', color: '#94a3b8' }}>Red IP:</span>
            <input 
              value={espIp} 
              onChange={(e) => setEspIp(e.target.value)} 
              style={styles.ipInput}
            />
          </div>

          <div style={styles.tabs}>
            <button 
              onClick={() => { setMetodoLogin('huella'); setMensajeEstado(''); }}
              style={metodoLogin === 'huella' ? styles.tabActive : styles.tab}
            >
              <Fingerprint size={18} /> Huella Dactilar
            </button>
            <button 
              onClick={() => { setMetodoLogin('voz'); setMensajeEstado(''); }}
              style={metodoLogin === 'voz' ? styles.tabActive : styles.tab}
            >
              <Mic size={18} /> Micrófono / Voz
            </button>
          </div>

          {metodoLogin === 'huella' ? (
            <div style={styles.authBox}>
              <div style={styles.pulseCircle}>
                <Fingerprint size={64} color="#3b82f6" />
              </div>
              <h3 style={{ margin: '10px 0 5px', color: '#f8fafc' }}>Escáner Activo</h3>
              <p style={{ color: '#94a3b8', fontSize: '13px', lineHeight: '1.4' }}>
                Coloca tu dedo registrado en el lector biométrico AS608.
              </p>
            </div>
          ) : (
            <div style={styles.authBox}>
              <button 
                onClick={iniciarReconocimientoVozReal}
                style={{
                  ...styles.micButton,
                  backgroundColor: escuchando ? '#ef4444' : '#3b82f6',
                  boxShadow: escuchando ? '0 0 25px rgba(239, 68, 68, 0.5)' : '0 0 25px rgba(59, 130, 246, 0.4)'
                }}
              >
                <Mic size={42} color="#fff" />
              </button>
              <h3 style={{ margin: '10px 0 5px', color: '#f8fafc' }}>
                {escuchando ? 'Escuchando micrófono...' : 'Presiona para Hablar'}
              </h3>
              <p style={{ color: '#94a3b8', fontSize: '13px' }}>Activa el servo y el zumbador por voz</p>
              {textoDetectado && (
                <div style={styles.speechBubble}>Detectado: "{textoDetectado}"</div>
              )}
            </div>
          )}

          {mensajeEstado && <div style={styles.alert}>{mensajeEstado}</div>}
        </div>
      </div>
    );
  }

  return (
    <div style={styles.dashboardContainer}>
      <header style={styles.dashHeader}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={styles.avatarIcon}>
            <UserCheck size={24} color="#3b82f6" />
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: '20px', color: '#f8fafc' }}>Panel de Control IoT</h2>
            <span style={{ fontSize: '13px', color: '#38bdf8' }}>
              Sesión activa: <strong>{usuarioActivo.nombre}</strong> ({usuarioActivo.metodo})
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button 
            onClick={async () => {
              try { 
                await fetch(`http://${espIp}/abrir`); 
                setMensajeEstado('🔓 Puerta abierta de forma remota.'); 
              } 
              catch(e){ setMensajeEstado('❌ Error al enviar comando.'); }
            }} 
            style={styles.openBtn}
          >
            <Unlock size={16} /> Abrir Puerta
          </button>
          <button onClick={() => setAutenticado(false)} style={styles.logoutBtn}>
            <LogOut size={16} /> Salir
          </button>
        </div>
      </header>

      {mensajeEstado && (
        <div style={styles.dashAlert}>
          <AlertCircle size={18} color="#38bdf8" />
          <span>{mensajeEstado}</span>
        </div>
      )}

      <div style={styles.grid}>
        <div style={styles.panel}>
          <div style={styles.panelHeader}>
            <Fingerprint size={22} color="#3b82f6" />
            <h3 style={styles.panelTitle}>Gestión de Huellas Biométricas</h3>
          </div>
          
          <form onSubmit={handleAgregarHuella} style={styles.form}>
            <div style={{ display: 'flex', gap: '6px', width: '100%' }}>
              <input 
                type="number" 
                min="1" 
                max="127"
                value={nuevoIdHuella}
                onChange={(e) => setNuevoIdHuella(e.target.value)}
                style={{ ...styles.input, width: '70px', textAlign: 'center' }}
                placeholder="ID"
                required
              />
              <input 
                type="text"
                value={nuevoNombreHuella}
                onChange={(e) => setNuevoNombreHuella(e.target.value)}
                style={{ ...styles.input, flex: 1 }}
                placeholder="Nombre del usuario..."
                required
              />
              <button type="submit" disabled={registrandoHuella} style={styles.addBtn}>
                <Plus size={18} /> {registrandoHuella ? 'Grabando...' : 'Registrar'}
              </button>
            </div>
          </form>

          <div style={styles.list}>
            {huellas.map(h => (
              <div key={h.id} style={styles.listItem}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={styles.badge}>ID #{h.id}</span>
                  <span style={{ fontWeight: '500', color: '#e2e8f0' }}>{h.nombre}</span>
                </div>
                <button onClick={() => handleBorrarHuella(h.id)} style={styles.delBtn} title="Eliminar huella">
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div style={styles.panel}>
          <div style={styles.panelHeader}>
            <Mic size={22} color="#10b981" />
            <h3 style={styles.panelTitle}>Frases Clave Autorizadas</h3>
          </div>
          
          <form onSubmit={handleAgregarVoz} style={styles.form}>
            <div style={{ display: 'flex', gap: '6px', width: '100%', marginBottom: '8px' }}>
              <input 
                type="text"
                value={nuevoUsuarioVoz}
                onChange={(e) => setNuevoUsuarioVoz(e.target.value)}
                style={{ ...styles.input, width: '110px' }}
                placeholder="Usuario"
                required
              />
              <input 
                type="text"
                value={nuevaFraseVoz}
                onChange={(e) => setNuevaFraseVoz(e.target.value)}
                style={{ ...styles.input, flex: 1 }}
                placeholder="Frase clave (ej: abrir puerta)"
                required
              />
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button type="submit" style={styles.addVoiceBtn}>
                <Plus size={18} /> Añadir Frase
              </button>
            </div>
          </form>

          <div style={styles.list}>
            {voces.map(v => (
              <div key={v.id} style={styles.listItem}>
                <div>
                  <span style={{ fontWeight: '600', color: '#f8fafc' }}>{v.usuario}</span>
                  <span style={{ display: 'block', fontSize: '13px', color: '#38bdf8', fontStyle: 'italic' }}>
                    "{v.frase}"
                  </span>
                </div>
                <button onClick={() => handleBorrarVoz(v.id)} style={styles.delBtn} title="Eliminar frase">
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const styles = {
  container: { minHeight: '100vh', backgroundColor: '#090d16', color: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui, sans-serif', padding: '20px' },
  card: { backgroundColor: '#111827', padding: '36px', borderRadius: '20px', width: '100%', maxWidth: '440px', boxShadow: '0 20px 40px rgba(0,0,0,0.6)', border: '1px solid #1f2937' },
  headerBadge: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', backgroundColor: 'rgba(56, 189, 248, 0.1)', padding: '6px 12px', borderRadius: '20px', width: 'fit-content', margin: '0 auto 16px', border: '1px solid rgba(56, 189, 248, 0.2)', fontSize: '12px', color: '#38bdf8', fontWeight: '600' },
  header: { textAlign: 'center', marginBottom: '20px' },
  title: { fontSize: '24px', fontWeight: '700', margin: '10px 0 6px', color: '#f8fafc' },
  subtitle: { fontSize: '13px', color: '#94a3b8', margin: 0 },
  ipBar: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', backgroundColor: '#1f2937', padding: '10px', borderRadius: '10px', marginBottom: '22px', border: '1px solid #374151' },
  ipInput: { backgroundColor: 'transparent', border: 'none', color: '#38bdf8', fontSize: '14px', width: '120px', outline: 'none', fontWeight: '700', textAlign: 'center' },
  tabs: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '24px' },
  tab: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '12px', borderRadius: '10px', border: '1px solid #374151', backgroundColor: 'transparent', color: '#94a3b8', cursor: 'pointer', fontWeight: '600', fontSize: '13px' },
  tabActive: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '12px', borderRadius: '10px', border: '1px solid #3b82f6', backgroundColor: 'rgba(59, 130, 246, 0.15)', color: '#fff', cursor: 'pointer', fontWeight: '600', fontSize: '13px' },
  authBox: { textAlign: 'center', padding: '10px 0' },
  pulseCircle: { width: '96px', height: '96px', borderRadius: '50%', backgroundColor: 'rgba(59, 130, 246, 0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', border: '2px dashed #3b82f6' },
  micButton: { width: '90px', height: '90px', borderRadius: '50%', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', transition: '0.3s' },
  speechBubble: { backgroundColor: '#1f2937', color: '#38bdf8', padding: '8px 12px', borderRadius: '8px', fontSize: '13px', marginTop: '12px', border: '1px solid #374151' },
  alert: { backgroundColor: '#1f2937', padding: '12px', borderRadius: '10px', fontSize: '13px', textAlign: 'center', marginTop: '16px', color: '#cbd5e1', border: '1px solid #374151' },
  dashboardContainer: { minHeight: '100vh', backgroundColor: '#090d16', color: '#f8fafc', padding: '30px', fontFamily: 'system-ui, sans-serif' },
  dashHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#111827', padding: '20px 24px', borderRadius: '16px', marginBottom: '20px', flexWrap: 'wrap', gap: '16px', border: '1px solid #1f2937' },
  avatarIcon: { width: '44px', height: '44px', borderRadius: '12px', backgroundColor: 'rgba(59, 130, 246, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(59, 130, 246, 0.3)' },
  openBtn: { display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: '#10b981', color: '#fff', border: 'none', padding: '10px 18px', borderRadius: '10px', cursor: 'pointer', fontWeight: '600', fontSize: '14px' },
  logoutBtn: { display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: '#ef4444', color: '#fff', border: 'none', padding: '10px 18px', borderRadius: '10px', cursor: 'pointer', fontWeight: '600', fontSize: '14px' },
  dashAlert: { display: 'flex', alignItems: 'center', gap: '10px', backgroundColor: '#111827', border: '1px solid #1f2937', padding: '12px 18px', borderRadius: '12px', marginBottom: '24px', fontSize: '14px', color: '#cbd5e1' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: '24px' },
  panel: { backgroundColor: '#111827', padding: '26px', borderRadius: '16px', border: '1px solid #1f2937' },
  panelHeader: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' },
  panelTitle: { margin: 0, fontSize: '17px', fontWeight: '600', color: '#f8fafc' },
  form: { display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' },
  input: { backgroundColor: '#1f2937', border: '1px solid #374151', color: '#fff', padding: '10px 14px', borderRadius: '10px', fontSize: '14px', outline: 'none' },
  addBtn: { display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: '#3b82f6', color: '#fff', border: 'none', padding: '10px 16px', borderRadius: '10px', cursor: 'pointer', fontWeight: '600', fontSize: '13px' },
  addVoiceBtn: { display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: '#10b981', color: '#fff', border: 'none', padding: '10px 16px', borderRadius: '10px', cursor: 'pointer', fontWeight: '600', fontSize: '13px', flex: 1, justifyContent: 'center' },
  list: { display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '280px', overflowY: 'auto' },
  listItem: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#1f2937', padding: '12px 16px', borderRadius: '10px', border: '1px solid #374151' },
  badge: { backgroundColor: '#374151', padding: '4px 8px', borderRadius: '6px', fontSize: '11px', color: '#38bdf8', fontWeight: '700' },
  delBtn: { backgroundColor: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '6px', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }
};
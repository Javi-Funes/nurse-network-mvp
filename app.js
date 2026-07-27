import { APPS_SCRIPT_URL, WHATSAPP_NUMBER } from "./config.js";

const DEMO_MODE = APPS_SCRIPT_URL.startsWith("REEMPLAZAR");

function formatFechaHora(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const URGENCIA_LABEL = {
  urgente: "🔴 Es urgente",
  hoy: "🟠 La necesita hoy",
  programada: "🟢 Programada",
};

function buildWhatsappMessage(payload, folio) {
  const lines = [
    "🆕 *NUEVA SOLICITUD – NURSE NETWORK*",
    folio ? `📋 *Pedido:* ${folio}` : null,
    `📅 *Recibido:* ${formatFechaHora(new Date())}`,
    "",
    `🙋 *Paciente:* ${payload.nombrePaciente}`,
    `📞 *Teléfono:* ${payload.telefono}`,
    `📍 *Zona:* ${payload.zona}`,
    `🏠 *Dirección:* ${payload.direccion}`,
    "",
    `📝 *Necesidad:* ${payload.necesidad}`,
    `⏳ *Duración:* ${payload.duracion}`,
    `⏱️ *Horario:* ${payload.horario}`,
    `🚨 *Urgencia:* ${URGENCIA_LABEL[payload.urgencia] || payload.urgencia}`,
    `💉 *Prestación:* ${payload.prestacion || "A evaluar por el operador"}`,
  ];
  if (payload.indicaciones) {
    lines.push(`🗒️ *Indicaciones:* ${payload.indicaciones}`);
  }
  return lines.filter((l) => l !== null).join("\n");
}

function buildWhatsappLink(payload, folio) {
  const texto = buildWhatsappMessage(payload, folio);
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(texto)}`;
}

function showMsg(form, type) {
  const ok = form.querySelector("#msg-ok");
  const err = form.querySelector("#msg-error");
  ok.classList.remove("show");
  err.classList.remove("show");
  (type === "ok" ? ok : err).classList.add("show");
}

function setLoading(btn, loading, labelBusy, labelIdle) {
  btn.disabled = loading;
  btn.textContent = loading ? labelBusy : labelIdle;
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Apps Script Web Apps no soportan bien preflight CORS con
// Content-Type: application/json + credenciales del navegador, así que
// enviamos como "text/plain" (evita el preflight) y el propio Apps Script
// hace JSON.parse(e.postData.contents).
async function sendToSheet(payload) {
  if (DEMO_MODE) {
    console.log("[DEMO] payload:", payload);
    await new Promise((r) => setTimeout(r, 500));
    return { status: "success", demo: true };
  }
  const res = await fetch(APPS_SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (data.status !== "success") throw new Error(data.message || "Error desconocido");
  return data;
}

/* ---------------- Formulario de SOLICITUD (paciente) ---------------- */
const formSolicitud = document.getElementById("form-solicitud");
if (formSolicitud) {
  const localidadSelect = formSolicitud.localidad;
  const localidadOtraWrap = document.getElementById("localidad-otra-wrap");
  if (localidadSelect && localidadOtraWrap) {
    localidadSelect.addEventListener("change", () => {
      const esOtra = localidadSelect.value === "otra";
      localidadOtraWrap.style.display = esOtra ? "" : "none";
      formSolicitud.localidadOtra.required = esOtra;
    });
  }

  formSolicitud.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = document.getElementById("btn-submit");
    setLoading(btn, true, "Enviando...", "Enviar solicitud");

    const localidad =
      formSolicitud.localidad.value === "otra"
        ? formSolicitud.localidadOtra.value.trim()
        : formSolicitud.localidad.value;

    const payload = {
      formType: "solicitud",
      empresa: formSolicitud.empresa ? formSolicitud.empresa.value.trim() : "",
      necesidad: formSolicitud.necesidad.value.trim(),
      nombrePaciente: formSolicitud.nombrePaciente.value.trim(),
      telefono: formSolicitud.telefono.value.trim(),
      localidad: localidad,
      zona: formSolicitud.zona.value.trim(),
      direccion: formSolicitud.direccion.value.trim(),
      duracion: formSolicitud.duracion.value,
      horario: formSolicitud.horario.value.trim(),
      urgencia: formSolicitud.urgencia.value,
      prestacion: formSolicitud.prestacion.value,
      indicaciones: formSolicitud.indicaciones.value.trim(),
      estado: "Nueva",
    };

    try {
      const resultado = await sendToSheet(payload);
      const waBtn = document.getElementById("btn-whatsapp");
      if (waBtn) {
        waBtn.href = buildWhatsappLink(payload, resultado && resultado.folio);
        waBtn.style.display = "inline-flex";
      }
      formSolicitud.reset();
      showMsg(formSolicitud, "ok");
    } catch (err) {
      console.error(err);
      showMsg(formSolicitud, "error");
    } finally {
      setLoading(btn, false, "Enviando...", "Enviar solicitud");
    }
  });
}

/* ---------------- Formulario de REGISTRO (profesional) ---------------- */
const formRegistro = document.getElementById("form-registro");
if (formRegistro) {
  const localidadOtraCheck = document.getElementById("localidad-otra-check");
  const localidadOtraWrapProf = document.getElementById("localidad-otra-wrap-prof");
  if (localidadOtraCheck && localidadOtraWrapProf) {
    localidadOtraCheck.addEventListener("change", () => {
      localidadOtraWrapProf.style.display = localidadOtraCheck.checked ? "" : "none";
    });
  }

  formRegistro.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = document.getElementById("btn-submit");
    setLoading(btn, true, "Enviando...", "Enviar registro");

    const prestaciones = Array.from(
      formRegistro.querySelectorAll('input[name="prestaciones"]:checked')
    ).map((cb) => cb.value);

    const localidades = Array.from(
      formRegistro.querySelectorAll('input[name="localidades"]:checked')
    )
      .map((cb) => {
        if (cb.value === "otra") {
          const libre = formRegistro.localidadOtraProf.value.trim();
          return libre ? `Otra: ${libre}` : null;
        }
        return cb.value;
      })
      .filter(Boolean);

    const payload = {
      formType: "profesional",
      empresa: formRegistro.empresa ? formRegistro.empresa.value.trim() : "",
      nombre: formRegistro.nombre.value.trim(),
      telefono: formRegistro.telefono.value.trim(),
      email: formRegistro.email.value.trim(),
      matricula: formRegistro.matricula.value.trim(),
      profesion: formRegistro.profesion.value,
      zona: formRegistro.zona.value.trim(),
      localidades: localidades.join(", "),
      prestaciones: prestaciones.join(", "),
      movilidad: formRegistro.movilidad.value,
      experiencia: formRegistro.experiencia.value.trim(),
      disponibilidad: formRegistro.disponibilidad.value.trim(),
      estado: "Pendiente de auditoría",
      archivos: [],
    };

    try {
      const files = formRegistro.documentacion.files;
      if (files && files.length && !DEMO_MODE) {
        const tiposPermitidos = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
        for (const file of files) {
          if (file.size > 8 * 1024 * 1024) {
            throw new Error(`El archivo ${file.name} pesa más de 8MB.`);
          }
          if (file.type && tiposPermitidos.indexOf(file.type) === -1) {
            throw new Error(`El archivo ${file.name} debe ser PDF o una foto (JPG, PNG, WEBP).`);
          }
          payload.archivos.push({
            fileName: file.name,
            fileMimeType: file.type || "application/octet-stream",
            fileBase64: await fileToBase64(file),
          });
        }
      }

      await sendToSheet(payload);
      formRegistro.reset();
      showMsg(formRegistro, "ok");
    } catch (err) {
      console.error(err);
      showMsg(formRegistro, "error");
    } finally {
      setLoading(btn, false, "Enviando...", "Enviar registro");
    }
  });
}

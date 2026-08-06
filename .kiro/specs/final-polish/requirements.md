# Final Polish — Requirements

## R1: Edición de venues
El admin debe poder editar nombre, dirección, ciudad, país y descripción de una sede existente desde el panel.

## R2: Selector de venue y sport en crear instalación
Al crear una instalación, el admin debe ver un dropdown para elegir la sede y otro para elegir el deporte. No deben usarse valores por defecto invisibles.

## R3: Modal de confirmación antes de eliminar
Toda acción destructiva (eliminar deporte, instalación, sede, bloqueo, desactivar usuario) debe pedir confirmación con un modal.

## R4: Toast de feedback
Al completar una acción exitosa (crear, editar, eliminar, confirmar reserva, cancelar) mostrar una notificación toast.

## R5: Endpoint para cambiar contraseña estando logueado
El usuario autenticado puede cambiar su contraseña actual desde el perfil (ingresa contraseña actual + nueva).

## R6: UI de cambiar contraseña en perfil
Sección en la página de perfil para cambiar contraseña con los 3 campos.

## R7: Validación de fortaleza de contraseña
En backend y frontend, la contraseña debe tener al menos: 8 caracteres, 1 mayúscula, 1 número.

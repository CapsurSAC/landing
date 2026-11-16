import { Logger } from '@nestjs/common';

// Las clases del kit usan `new Logger(...)`; en pruebas no deben ensuciar la salida.
Logger.overrideLogger(false);

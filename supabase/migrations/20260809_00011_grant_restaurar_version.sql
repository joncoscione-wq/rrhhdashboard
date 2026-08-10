-- La RPC restaurar_version() solo tenia grant execute a service_role,
-- por lo que el cliente (anon key -> rol authenticated) fallaba con 42501.
-- El boton "Restaurar" de la UI existe pero nunca funciono.
grant execute on function restaurar_version(text, bigint, integer) to authenticated;

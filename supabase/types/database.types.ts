
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "analisis_mensuales": {
                  Row: {
                    "contenido": Json | null,"created_at": string,"datos": Json | null,"error_codigo": string | null,"estado": string,"generado_at": string | null,"id": string,"idioma": string,"intentos": number,"mes": string,"mes_incompleto": boolean,"modelo": string | null,"regeneraciones": number,"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "contenido"?: Json | null,"created_at"?: string,"datos"?: Json | null,"error_codigo"?: string | null,"estado"?: string,"generado_at"?: string | null,"id"?: string,"idioma"?: string,"intentos"?: number,"mes": string,"mes_incompleto"?: boolean,"modelo"?: string | null,"regeneraciones"?: number,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "contenido"?: Json | null,"created_at"?: string,"datos"?: Json | null,"error_codigo"?: string | null,"estado"?: string,"generado_at"?: string | null,"id"?: string,"idioma"?: string,"intentos"?: number,"mes"?: string,"mes_incompleto"?: boolean,"modelo"?: string | null,"regeneraciones"?: number,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [

                  ]
                },"categorias": {
                  Row: {
                    "archivada": boolean,"clave": string | null,"color": string,"created_at": string,"icono": string | null,"id": string,"nombre": string,"orden": number,"tipo": Database["public"]['Enums']["tipo_categoria"],"user_id": string
                  }
                  Insert: {
                    "archivada"?: boolean,"clave"?: string | null,"color"?: string,"created_at"?: string,"icono"?: string | null,"id"?: string,"nombre": string,"orden"?: number,"tipo": Database["public"]['Enums']["tipo_categoria"],"user_id"?: string
                  }
                  Update: {
                    "archivada"?: boolean,"clave"?: string | null,"color"?: string,"created_at"?: string,"icono"?: string | null,"id"?: string,"nombre"?: string,"orden"?: number,"tipo"?: Database["public"]['Enums']["tipo_categoria"],"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"cuentas": {
                  Row: {
                    "archivada": boolean | null,"color": string | null,"created_at": string,"emoji": string | null,"entidad": string | null,"es_principal": boolean,"fecha_cierre": string | null,"fecha_inicial": string,"id": string,"nombre": string,"orden": number,"saldo_inicial": number,"tipo": Database["public"]['Enums']["tipo_cuenta"],"user_id": string
                  }
                  Insert: {
                    "archivada"?: never,"color"?: string | null,"created_at"?: string,"emoji"?: string | null,"entidad"?: string | null,"es_principal"?: boolean,"fecha_cierre"?: string | null,"fecha_inicial"?: string,"id"?: string,"nombre": string,"orden"?: number,"saldo_inicial"?: number,"tipo"?: Database["public"]['Enums']["tipo_cuenta"],"user_id"?: string
                  }
                  Update: {
                    "archivada"?: never,"color"?: string | null,"created_at"?: string,"emoji"?: string | null,"entidad"?: string | null,"es_principal"?: boolean,"fecha_cierre"?: string | null,"fecha_inicial"?: string,"id"?: string,"nombre"?: string,"orden"?: number,"saldo_inicial"?: number,"tipo"?: Database["public"]['Enums']["tipo_cuenta"],"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"movimientos": {
                  Row: {
                    "categoria_id": string | null,"clave_idempotencia": string | null,"comercio": string | null,"concepto": string,"created_at": string,"cuenta_destino_id": string | null,"cuenta_id": string,"devolucion_de": string | null,"fecha": string,"hora": string | null,"id": string,"importe": number,"metodo": Database["public"]['Enums']["metodo_pago"] | null,"notas": string | null,"notion_id": string | null,"origen": Database["public"]['Enums']["origen_movimiento"],"sentido": Database["public"]['Enums']["sentido_ajuste"] | null,"tipo": Database["public"]['Enums']["tipo_movimiento"],"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "categoria_id"?: string | null,"clave_idempotencia"?: string | null,"comercio"?: string | null,"concepto": string,"created_at"?: string,"cuenta_destino_id"?: string | null,"cuenta_id": string,"devolucion_de"?: string | null,"fecha"?: string,"hora"?: string | null,"id"?: string,"importe": number,"metodo"?: Database["public"]['Enums']["metodo_pago"] | null,"notas"?: string | null,"notion_id"?: string | null,"origen"?: Database["public"]['Enums']["origen_movimiento"],"sentido"?: Database["public"]['Enums']["sentido_ajuste"] | null,"tipo": Database["public"]['Enums']["tipo_movimiento"],"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "categoria_id"?: string | null,"clave_idempotencia"?: string | null,"comercio"?: string | null,"concepto"?: string,"created_at"?: string,"cuenta_destino_id"?: string | null,"cuenta_id"?: string,"devolucion_de"?: string | null,"fecha"?: string,"hora"?: string | null,"id"?: string,"importe"?: number,"metodo"?: Database["public"]['Enums']["metodo_pago"] | null,"notas"?: string | null,"notion_id"?: string | null,"origen"?: Database["public"]['Enums']["origen_movimiento"],"sentido"?: Database["public"]['Enums']["sentido_ajuste"] | null,"tipo"?: Database["public"]['Enums']["tipo_movimiento"],"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "movimientos_categoria_id_user_id_fkey"
      columns: ["categoria_id","user_id"]
isOneToOne: false
      referencedRelation: "categorias"
      referencedColumns: ["id","user_id"]
    },{
      foreignKeyName: "movimientos_cuenta_destino_id_user_id_fkey"
      columns: ["cuenta_destino_id","user_id"]
isOneToOne: false
      referencedRelation: "cuentas"
      referencedColumns: ["id","user_id"]
    },{
      foreignKeyName: "movimientos_cuenta_destino_id_user_id_fkey"
      columns: ["cuenta_destino_id","user_id"]
isOneToOne: false
      referencedRelation: "v_saldos"
      referencedColumns: ["id","user_id"]
    },{
      foreignKeyName: "movimientos_cuenta_id_user_id_fkey"
      columns: ["cuenta_id","user_id"]
isOneToOne: false
      referencedRelation: "cuentas"
      referencedColumns: ["id","user_id"]
    },{
      foreignKeyName: "movimientos_cuenta_id_user_id_fkey"
      columns: ["cuenta_id","user_id"]
isOneToOne: false
      referencedRelation: "v_saldos"
      referencedColumns: ["id","user_id"]
    },{
      foreignKeyName: "movimientos_devolucion_de_user_id_fkey"
      columns: ["devolucion_de","user_id"]
isOneToOne: false
      referencedRelation: "movimientos"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"objetivos": {
                  Row: {
                    "activo": boolean,"categoria_id": string | null,"created_at": string,"id": string,"importe": number,"tipo": Database["public"]['Enums']["tipo_objetivo"],"user_id": string
                  }
                  Insert: {
                    "activo"?: boolean,"categoria_id"?: string | null,"created_at"?: string,"id"?: string,"importe": number,"tipo": Database["public"]['Enums']["tipo_objetivo"],"user_id"?: string
                  }
                  Update: {
                    "activo"?: boolean,"categoria_id"?: string | null,"created_at"?: string,"id"?: string,"importe"?: number,"tipo"?: Database["public"]['Enums']["tipo_objetivo"],"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "objetivos_categoria_id_user_id_fkey"
      columns: ["categoria_id","user_id"]
isOneToOne: false
      referencedRelation: "categorias"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"perfiles": {
                  Row: {
                    "created_at": string,"idioma": string,"onboarding_completado": boolean,"user_id": string,"zona_horaria": string
                  }
                  Insert: {
                    "created_at"?: string,"idioma"?: string,"onboarding_completado"?: boolean,"user_id"?: string,"zona_horaria"?: string
                  }
                  Update: {
                    "created_at"?: string,"idioma"?: string,"onboarding_completado"?: boolean,"user_id"?: string,"zona_horaria"?: string
                  }
                  Relationships: [

                  ]
                },"registro_config": {
                  Row: {
                    "abierto": boolean,"id": boolean,"updated_at": string
                  }
                  Insert: {
                    "abierto"?: boolean,"id"?: boolean,"updated_at"?: string
                  }
                  Update: {
                    "abierto"?: boolean,"id"?: boolean,"updated_at"?: string
                  }
                  Relationships: [

                  ]
                },"registro_permitidos": {
                  Row: {
                    "created_at": string,"email": string
                  }
                  Insert: {
                    "created_at"?: string,"email": string
                  }
                  Update: {
                    "created_at"?: string,"email"?: string
                  }
                  Relationships: [

                  ]
                },"tokens_api": {
                  Row: {
                    "created_at": string,"id": string,"nombre": string,"revocado": boolean,"token_hash": string,"ultimo_uso": string | null,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"nombre": string,"revocado"?: boolean,"token_hash": string,"ultimo_uso"?: string | null,"user_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"nombre"?: string,"revocado"?: boolean,"token_hash"?: string,"ultimo_uso"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"valoraciones": {
                  Row: {
                    "created_at": string,"cuenta_id": string,"fecha": string,"id": string,"nota": string | null,"updated_at": string,"user_id": string,"valor": number
                  }
                  Insert: {
                    "created_at"?: string,"cuenta_id": string,"fecha": string,"id"?: string,"nota"?: string | null,"updated_at"?: string,"user_id"?: string,"valor": number
                  }
                  Update: {
                    "created_at"?: string,"cuenta_id"?: string,"fecha"?: string,"id"?: string,"nota"?: string | null,"updated_at"?: string,"user_id"?: string,"valor"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "valoraciones_cuenta_id_user_id_fkey"
      columns: ["cuenta_id","user_id"]
isOneToOne: false
      referencedRelation: "cuentas"
      referencedColumns: ["id","user_id"]
    },{
      foreignKeyName: "valoraciones_cuenta_id_user_id_fkey"
      columns: ["cuenta_id","user_id"]
isOneToOne: false
      referencedRelation: "v_saldos"
      referencedColumns: ["id","user_id"]
    }
                  ]
                }
          }
          Views: {
            "v_efectos": {
                  Row: {
                    "cuenta_id": string | null,"delta": number | null,"fecha": string | null,"movimiento_id": string | null,"user_id": string | null
                  }
                  Relationships: [
                    
                  ]
                },"v_saldos": {
                  Row: {
                    "emoji": string | null,"id": string | null,"nombre": string | null,"orden": number | null,"saldo_inicial": number | null,"tipo": Database["public"]['Enums']["tipo_cuenta"] | null,"user_id": string | null,"valor": number | null
                  }
                  Insert: {
                           "emoji"?: string | null,"id"?: string | null,"nombre"?: string | null,"orden"?: number | null,"saldo_inicial"?: number | null,"tipo"?: Database["public"]['Enums']["tipo_cuenta"] | null,"user_id"?: string | null,"valor"?: never
                         }
                        Update: {
                           "emoji"?: string | null,"id"?: string | null,"nombre"?: string | null,"orden"?: number | null,"saldo_inicial"?: number | null,"tipo"?: Database["public"]['Enums']["tipo_cuenta"] | null,"user_id"?: string | null,"valor"?: never
                         }
                        Relationships: [
                    
                  ]
                }
          }
          Functions: {
            "completar_onboarding":
{ Args: { "p_bancos": Json,"p_efectivo": string,"p_idioma": string }; Returns: undefined
                           },
"comparativa_estadisticas":
{ Args: { "p_desde": string,"p_desde_ant"?: string,"p_hasta": string,"p_hasta_ant"?: string }; Returns: {
              "balance": number,"balance_anterior": number,"dias": number,"gasto_medio_diario": number,"gastos_netos": number,"gastos_netos_anterior": number,"ingresos": number,"ingresos_anterior": number,"mayor_concepto": string,"mayor_importe": number,"variacion_balance": number,"variacion_gastos": number,"variacion_ingresos": number
            }[]
                           },
"calcular_ajuste":
{ Args: { "p_cuenta": string,"p_fecha"?: string,"p_saldo_real": string }; Returns: {
              "diferencia": number,"saldo_app": number,"saldo_real": number,"sentido": Database["public"]['Enums']["sentido_ajuste"] | null
            }[]
                           },
"categorias_mas_usadas":
{ Args: { "p_tipo": Database["public"]['Enums']["tipo_categoria"] }; Returns: {
              "categoria_id": string,"usos": number
            }[]
                           },
"crear_ajuste":
{ Args: { "p_concepto"?: string,"p_cuenta": string,"p_fecha"?: string,"p_nota": string,"p_saldo_real": string }; Returns: {
              "diferencia": number,"id": string | null,"sentido": Database["public"]['Enums']["sentido_ajuste"] | null
            }[]
                           },
"crear_banco":
{ Args: { "p_color": string | null,"p_entidad": string | null,"p_fecha_inicial"?: string | null,"p_nombre": string | null,"p_saldo": string }; Returns: string
                           },
"crear_token":
{ Args: { "p_nombre"?: string }; Returns: string
                           },
"datos_analisis":
{ Args: { "p_mes": string }; Returns: Json
                           },
"datos_analisis_usuario":
{ Args: { "p_mes": string,"p_user": string }; Returns: Json
                           },
"dia_equivalente_mes_anterior":
{ Args: { "p_fecha": string }; Returns: string
                           },
"fecha_local":
{ Args: { "p_instante": string,"p_zona"?: string }; Returns: string
                           },
"fuera_del_balance":
{ Args: { "p_desde": string,"p_hasta": string }; Returns: {
              "cuenta": string,"cuenta_destino": string,"importe": number,"sentido": Database["public"]['Enums']["sentido_ajuste"],"tipo": Database["public"]['Enums']["tipo_movimiento"]
            }[]
                           },
"gastos_devolvibles":
{ Args: { "p_excluir"?: string | null,"p_limite"?: number }; Returns: {
              "categoria_id": string,"concepto": string,"cuenta_id": string,"fecha": string,"id": string,"importe": number,"pendiente": number
            }[]
                           },
"gasto_por_categoria":
{ Args: { "p_desde": string,"p_hasta": string }; Returns: {
              "categoria_id": string,"color": string,"gasto": number,"icono": string,"nombre": string
            }[]
                           },
"gasto_por_dia":
{ Args: { "p_desde": string,"p_hasta": string }; Returns: {
              "fecha": string,"gasto_neto": number
            }[]
                           },
"gasto_por_metodo":
{ Args: { "p_desde": string,"p_hasta": string }; Returns: {
              "gasto": number,"metodo": Database["public"]['Enums']["metodo_pago"]
            }[]
                           },
"hacer_principal":
{ Args: { "p_cuenta": string }; Returns: undefined
                           },
"hoy_usuario":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"ingresos_por_categoria":
{ Args: { "p_desde": string,"p_hasta": string }; Returns: {
              "categoria_id": string,"color": string,"icono": string,"ingreso": number,"nombre": string
            }[]
                           },
"leer_importe":
{ Args: { "p": string }; Returns: number
                           },
"leer_saldo":
{ Args: { "p": string }; Returns: number
                           },
"media_gasto_categoria":
{ Args: { "p_categoria": string,"p_meses"?: number }; Returns: {
              "media": number | null,"meses": number
            }[]
                           },
"movimientos_filtrados":
{ Args: { "p_categoria"?: string | null,"p_cuenta"?: string | null,"p_desde"?: string | null,"p_hasta"?: string | null,"p_metodo"?: Database["public"]['Enums']["metodo_pago"] | null,"p_q"?: string | null,"p_tipo"?: Database["public"]['Enums']["tipo_movimiento"] | null }; Returns: Database["public"]["Tables"]["movimientos"]["Row"][]
                           },
"movimientos_por_dia":
{ Args: { "p_desde": string,"p_hasta": string }; Returns: {
              "devoluciones": number,"fecha": string,"gasto_neto": number,"gastos": number,"ingresos": number,"movimientos": Json
            }[]
                           },
"nombre_entidad":
{ Args: { "p_entidad": string }; Returns: string
                           },
"normalizar_concepto":
{ Args: { "p": string }; Returns: string
                           },
"patrimonio":
{ Args: { "p_fecha": string }; Returns: number
                           },
"preparar_usuario":
{ Args: { "p_dispositivo"?: string,"p_email": string }; Returns: string
                           },
"registrar_movimiento":
{ Args: { "categoria"?: string,"clave"?: string,"comercio"?: string,"concepto"?: string,"desde"?: string,"fecha"?: string,"hacia"?: string,"importe": string,"metodo"?: string,"tipo": string,"token": string }; Returns: Json
                           },
"reintentar_analisis":
{ Args: { "p_mes": string }; Returns: undefined
                           },
"resumen_filtro":
{ Args: { "p_categoria"?: string | null,"p_cuenta"?: string | null,"p_desde"?: string | null,"p_hasta"?: string | null,"p_metodo"?: Database["public"]['Enums']["metodo_pago"] | null,"p_q"?: string | null,"p_tipo"?: Database["public"]['Enums']["tipo_movimiento"] | null }; Returns: {
              "ajustes": number,"balance": number,"categoria_gasto": number,"categoria_id": string,"devoluciones": number,"dias": number,"gasto_medio_diario": number,"gastos": number,"gastos_netos": number,"ingresos": number,"n": number
            }[]
                           },
"resumen_mensual":
{ Args: { "p_desde": string,"p_hasta": string }; Returns: {
              "ahorro_pct": number,"ajustes": number,"balance": number,"devoluciones": number,"gastos": number,"gastos_netos": number,"ingresos": number,"mes": string
            }[]
                           },
"resumen_periodo":
{ Args: { "p_desde": string,"p_hasta": string }; Returns: {
              "ahorro_pct": number,"ajustes": number,"balance": number,"devoluciones": number,"gastos": number,"gastos_netos": number,"ingresos": number
            }[]
                           },
"revalorizacion":
{ Args: { "p_cuenta": string,"p_d1": string,"p_d2": string }; Returns: number
                           },
"serie_patrimonio":
{ Args: { "p_desde": string,"p_hasta": string,"p_hoy"?: string }; Returns: {
              "fecha": string,"patrimonio": number,"provisional": boolean
            }[]
                           },
"subtotales_por_dia":
{ Args: { "p_categoria"?: string | null,"p_cuenta"?: string | null,"p_desde"?: string | null,"p_hasta"?: string | null,"p_metodo"?: Database["public"]['Enums']["metodo_pago"] | null,"p_q"?: string | null,"p_tipo"?: Database["public"]['Enums']["tipo_movimiento"] | null }; Returns: {
              "balance": number | null,"fecha": string,"n": number
            }[]
                           },
"sugerir_categoria":
{ Args: { "p_concepto": string,"p_tipo"?: Database["public"]['Enums']["tipo_categoria"] }; Returns: string | null
                           },
"totales_por_tipo":
{ Args: { "p_categoria"?: string | null,"p_cuenta"?: string | null,"p_desde"?: string | null,"p_hasta"?: string | null,"p_metodo"?: Database["public"]['Enums']["metodo_pago"] | null,"p_q"?: string | null }; Returns: {
              "n": number,"tipo": Database["public"]['Enums']["tipo_movimiento"],"total": number
            }[]
                           },
"solicitar_regeneracion":
{ Args: { "p_mes": string }; Returns: undefined
                           },
"valor_cuenta":
{ Args: { "p_cuenta": string,"p_fecha": string }; Returns: number
                           },
"valores_cuentas":
{ Args: { "p_fecha": string }; Returns: {
              "cuenta_id": string,"valor": number
            }[]
                           },
"variacion_patrimonial":
{ Args: { "p_d1": string,"p_d2": string }; Returns: {
              "ajustes": number,"balance": number,"patrimonio_final": number,"patrimonio_inicial": number,"revalorizacion": number,"saldos_iniciales": number,"variacion": number
            }[]
                           },
"variacion_porcentual":
{ Args: { "p_actual": number,"p_anterior": number }; Returns: number
                           }
          }
          Enums: {
            "metodo_pago": "tarjeta"|"apple_pay"|"efectivo"|"transferencia"|"bizum"|"domiciliacion","origen_movimiento": "app"|"atajo"|"apple_pay"|"importado","sentido_ajuste": "suma"|"resta","tipo_categoria": "gasto"|"ingreso","tipo_cuenta": "banco"|"efectivo"|"inversion"|"pasivo"|"por_cobrar","tipo_movimiento": "gasto"|"ingreso"|"devolucion"|"traspaso"|"ajuste","tipo_objetivo": "ahorro_mensual"|"limite_categoria"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "metodo_pago": ["tarjeta", "apple_pay", "efectivo", "transferencia", "bizum", "domiciliacion"],"origen_movimiento": ["app", "atajo", "apple_pay", "importado"],"sentido_ajuste": ["suma", "resta"],"tipo_categoria": ["gasto", "ingreso"],"tipo_cuenta": ["banco", "efectivo", "inversion", "pasivo", "por_cobrar"],"tipo_movimiento": ["gasto", "ingreso", "devolucion", "traspaso", "ajuste"],"tipo_objetivo": ["ahorro_mensual", "limite_categoria"]
          }
        }
} as const
